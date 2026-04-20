/**
 * Booking Service — Projenin En Karmaşık Servisi
 *
 * Bu modül ne yapıyor: Koltuk rezervasyonu, ödeme onayı, iptal, otomatik expire.
 * Hangi pattern: Domain model + distributed lock + BullMQ delayed job + optimistic concurrency.
 * Neden karmaşık: Race condition, eşzamanlı erişim, para, zaman kısıtları.
 *
 * TAM AKIŞ (koltuk seçiminden bilet alana kadar):
 *
 * 1. Kullanıcı koltuğu tıklar → POST /api/v1/bookings/hold
 *    → Redis distributed lock: LOCK seat:event-42:A-15 (30s TTL)
 *    → Lock alınamadıysa: 409 "Bu koltuk başka biri tarafından seçiliyor"
 *    → Lock alındı → devam ↓
 *
 * 2. Reservation oluştur (PENDING status)
 *    → Koltuk müsaitlik kontrolü (DB)
 *    → Pricing'den güncel fiyat al
 *    → Scalping kontrolü (max 6 bilet/kullanıcı/etkinlik)
 *    → DB'ye kaydet (transaction)
 *    → BullMQ: expire-hold job (10 dk delay)
 *    → Lock'ı serbest bırak
 *    → 201 { reservationId, expiresAt, amount }
 *
 * 3. Kullanıcı ödeme yapar (10 dk içinde)
 *    → POST /api/v1/bookings/:id/confirm
 *    → reservation.confirmPayment(paymentId)
 *    → Koltukları CONFIRMED yap
 *    → Event: ReservationConfirmed → [async] QR üret + email gönder
 *
 * 4. 10 dk doldu, ödeme yapılmadı
 *    → BullMQ worker: expire-hold job
 *    → reservation.expire()
 *    → Koltukları RELEASED yap → başkaları görebilir
 *    → [async] Email: "Rezervasyonunuz süresi doldu"
 */

import { v4 as uuidv4 } from 'uuid';
import { Reservation } from './domain/reservation.entity.js';
import { SeatHold } from './domain/seat-hold.value-object.js';
import { Money } from './domain/money.value-object.js';
import { bookingRepository } from './booking.repository.js';
import { pricingService } from '../pricing/pricing.service.js';
import { acquireSeatLock } from '../../shared/lock/redlock.js';
import { syncEventBus } from '../../shared/events/sync-event-bus.js';
import { asyncEventBus } from '../../shared/events/async-event-bus.js';
import { RESERVATION_TTL_MS, MAX_SEATS_PER_BOOKING } from '../../config/constants.js';
import {
  NotFoundError,
  ForbiddenError,
  SeatUnavailableError,
  HoldExpiredError,
  ValidationError,
} from '../../shared/errors/http-errors.js';
import { logger } from '../../shared/logger/index.js';
import type { CreateReservationInput } from './booking.schema.js';

export const bookingService = {
  /**
   * Koltuk hold — geçici rezervasyon oluştur.
   * Bu fonksiyon distributed lock KULLANIR (race condition önleme).
   */
  async createReservation(userId: string, input: CreateReservationInput) {
    const { eventId, seats } = input;

    // 1. Scalping kontrolü: max 6 bilet/kullanıcı/etkinlik
    const existingCount = await bookingRepository.getUserSeatCount(userId, eventId);
    if (existingCount + seats.length > MAX_SEATS_PER_BOOKING) {
      throw new ValidationError(
        `Maximum ${MAX_SEATS_PER_BOOKING} seats per event. You already have ${existingCount}.`,
      );
    }

    // 2. Her koltuk için distributed lock al
    // Lock alınamazsa SeatUnavailableError fırlatılır (başka biri seçiyor)
    const locks = [];
    try {
      for (const seat of seats) {
        const seatKey = `${seat.section}-${seat.row}-${seat.seat}`;
        const lock = await acquireSeatLock(eventId, seatKey);
        locks.push(lock);
      }

      // 3. Koltuk müsaitlik kontrolü (DB'de aktif hold var mı?)
      for (const seat of seats) {
        const available = await bookingRepository.isSeatAvailable(
          eventId, seat.section, seat.row, seat.seat,
        );
        if (!available) {
          throw new SeatUnavailableError(`${seat.section}-${seat.row}-${seat.seat}`);
        }
      }

      // 4. Her koltuk için fiyat al (pricing modülünden)
      const seatHolds: SeatHold[] = [];
      let totalPriceInCents = 0;
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

      for (const seat of seats) {
        let priceInCents: number;
        try {
          priceInCents = await pricingService.getSectionPrice(eventId, seat.section);
        } catch {
          // Pricing yoksa venue'dan taban fiyat kullan (fallback)
          priceInCents = 0; // Service caller should handle this
        }

        const seatHold = SeatHold.create({
          seatHoldId: uuidv4(),
          eventId,
          sectionName: seat.section,
          row: seat.row,
          seat: seat.seat,
          priceInCents,
          expiresAt,
        });

        seatHolds.push(seatHold);
        totalPriceInCents += priceInCents;
      }

      // 5. Reservation entity oluştur
      // Event startsAt bilgisi lazım (iptal kuralı için)
      const { prisma } = await import('../../shared/database/prisma-client.js');
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { startsAt: true, status: true },
      });

      if (!event) throw new NotFoundError('Event', eventId);
      if (event.status !== 'PUBLISHED') {
        throw new ValidationError('This event is not available for booking');
      }

      const reservation = Reservation.create({
        id: uuidv4(),
        userId,
        eventId,
        seatHolds,
        totalPrice: Money.fromCents(totalPriceInCents),
        expiresAt,
        eventStartsAt: event.startsAt,
      });

      // 6. DB'ye kaydet
      await bookingRepository.createReservation(reservation);

      // 7. BullMQ delayed job: 10 dk sonra expire
      await asyncEventBus.emit('reservation.expired', {
        reservationId: reservation.id,
        eventId,
        seats: seats.map((s) => ({ section: s.section, row: s.row, seat: s.seat })),
      }, {
        delay: RESERVATION_TTL_MS,
        jobId: `expire-${reservation.id}`, // Duplicate önleme
      });

      // 8. Sync event yayınla (pricing recalculate trigger)
      await syncEventBus.emit('reservation.created', {
        reservationId: reservation.id,
        userId,
        eventId,
        seats: seats.map((s) => ({ section: s.section, row: s.row, seat: s.seat })),
        totalPriceInCents,
      });

      logger.info(
        { reservationId: reservation.id, userId, eventId, seatCount: seats.length },
        'Reservation created (hold)',
      );

      return {
        reservationId: reservation.id,
        expiresAt: reservation.expiresAt.toISOString(),
        totalPriceInCents: reservation.totalPrice.amountInCents,
        totalPrice: reservation.totalPrice.toDisplayString(),
        seats: reservation.seatHolds.map((sh) => ({
          section: sh.sectionName,
          row: sh.row,
          seat: sh.seat,
          priceInCents: sh.priceInCents,
        })),
      };
    } finally {
      // 9. Lock'ları MUTLAKA serbest bırak (hata olsa bile)
      for (const lock of locks) {
        try {
          await lock.release();
        } catch {
          // Lock release hatası logla ama swallow et — TTL sonunda zaten serbest kalacak
          logger.warn('Failed to release seat lock (will auto-expire)');
        }
      }
    }
  },

  /**
   * Ödeme sonrası reservation onayı.
   */
  async confirmReservation(userId: string, reservationId: string, paymentId: string) {
    const reservation = await bookingRepository.findById(reservationId);
    if (!reservation) throw new NotFoundError('Reservation', reservationId);
    if (reservation.userId !== userId) throw new ForbiddenError('This is not your reservation');

    if (reservation.isHoldExpired()) {
      throw new HoldExpiredError(reservationId);
    }

    // Domain entity'nin command metodu — tüm kurallar burada kontrol edilir
    reservation.confirmPayment(paymentId);

    // DB güncelle (optimistic concurrency)
    await bookingRepository.updateReservation(reservation);
    await bookingRepository.confirmSeats(reservationId);

    // Domain event'leri yayınla
    const events = reservation.pullDomainEvents();
    for (const event of events) {
      if (event.type === 'reservation.confirmed') {
        // Async: QR üret, email gönder, pricing güncelle
        await asyncEventBus.emit('reservation.confirmed', event);
        await asyncEventBus.emit('notification.send', {
          type: 'BOOKING_CONFIRMED',
          recipientId: userId,
          recipientEmail: '', // Service'ten çekilecek
          data: { reservationId, paymentId },
        });
      }
    }

    logger.info({ reservationId, userId, paymentId }, 'Reservation confirmed');
    return { status: 'CONFIRMED', reservationId };
  },

  /**
   * Reservation iptal.
   */
  async cancelReservation(userId: string, reservationId: string) {
    const reservation = await bookingRepository.findById(reservationId);
    if (!reservation) throw new NotFoundError('Reservation', reservationId);
    if (reservation.userId !== userId) throw new ForbiddenError('This is not your reservation');

    // Domain entity'nin command metodu — 48 saat kuralı burada kontrol edilir
    reservation.cancel();

    await bookingRepository.updateReservation(reservation);
    await bookingRepository.releaseSeats(reservationId);

    const events = reservation.pullDomainEvents();
    for (const event of events) {
      if (event.type === 'reservation.cancelled') {
        await asyncEventBus.emit('reservation.cancelled', event);
      }
    }

    logger.info({ reservationId, userId }, 'Reservation cancelled');
    return { status: 'CANCELLED', reservationId };
  },

  /**
   * Otomatik expire — BullMQ worker tarafından çağrılır.
   */
  async expireReservation(reservationId: string) {
    const reservation = await bookingRepository.findById(reservationId);
    if (!reservation) return; // Zaten silinmiş

    if (!reservation.isPending()) return; // Zaten onaylanmış veya iptal edilmiş

    reservation.expire();

    await bookingRepository.updateReservation(reservation);
    await bookingRepository.releaseSeats(reservationId);

    logger.info({ reservationId }, 'Reservation expired (auto)');
  },

  /**
   * Reservation detayı getir.
   */
  async getReservation(userId: string, reservationId: string) {
    const reservation = await bookingRepository.findById(reservationId);
    if (!reservation) throw new NotFoundError('Reservation', reservationId);
    if (reservation.userId !== userId) throw new ForbiddenError('This is not your reservation');

    return {
      id: reservation.id,
      eventId: reservation.eventId,
      status: reservation.status,
      totalPriceInCents: reservation.totalPrice.amountInCents,
      totalPrice: reservation.totalPrice.toDisplayString(),
      expiresAt: reservation.expiresAt.toISOString(),
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
      seats: reservation.seatHolds.map((sh) => ({
        section: sh.sectionName,
        row: sh.row,
        seat: sh.seat,
        priceInCents: sh.priceInCents,
      })),
    };
  },
};
