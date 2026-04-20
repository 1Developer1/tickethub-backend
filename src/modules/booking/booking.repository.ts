/**
 * Booking Repository — Data Access with Optimistic Concurrency
 *
 * OPTIMISTIC CONCURRENCY:
 * ```sql
 * UPDATE reservations SET status='CONFIRMED', version=version+1
 *   WHERE id = :id AND version = :expectedVersion
 * ```
 * Eğer 0 satır güncellendiyse → başka bir process aynı anda güncellemiş → ConflictError.
 *
 * NEDEN?
 * İki farklı process aynı reservation'ı aynı anda güncellerse:
 * - Process A: confirm (PENDING → CONFIRMED, version 1 → 2)
 * - Process B: expire (PENDING → EXPIRED, version 1 → 2)
 * İkisi de version=1 bekliyor. A önce yazarsa version=2 olur.
 * B version=1 arıyor ama bulamıyor → ConflictError → retry.
 * Sonuç: çift işlem önlenir, veri tutarlılığı sağlanır.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { ConflictError } from '../../shared/errors/http-errors.js';
import { Money } from './domain/money.value-object.js';
import { Reservation, type ReservationStatus } from './domain/reservation.entity.js';
import { SeatHold } from './domain/seat-hold.value-object.js';

export const bookingRepository = {
  /**
   * Reservation kaydet (yeni oluşturma).
   * Transaction içinde: reservation + seatHolds birlikte yazılır.
   */
  async createReservation(reservation: Reservation): Promise<void> {
    const data = reservation.toPersistence();

    await prisma.$transaction(async (tx) => {
      await tx.reservation.create({
        data: {
          id: data.id,
          userId: data.userId,
          eventId: data.eventId,
          status: data.status,
          totalPriceInCents: data.totalPriceInCents,
          version: data.version,
          expiresAt: data.expiresAt,
        },
      });

      // SeatHold'ları oluştur
      const seatHoldData = reservation.seatHolds.map((sh) => ({
        reservationId: data.id,
        eventId: data.eventId,
        sectionName: sh.sectionName,
        row: sh.row,
        seat: sh.seat,
        priceInCents: sh.priceInCents,
        status: 'HELD' as const,
      }));

      await tx.seatHold.createMany({ data: seatHoldData });
    });
  },

  /**
   * Reservation güncelle (optimistic concurrency ile).
   * version uyuşmazlığı → ConflictError.
   */
  async updateReservation(reservation: Reservation): Promise<void> {
    const data = reservation.toPersistence();

    const result = await prisma.reservation.updateMany({
      where: {
        id: data.id,
        version: data.version - 1, // Önceki version'ı bekle
      },
      data: {
        status: data.status,
        version: data.version,
        confirmedAt: data.confirmedAt,
        cancelledAt: data.cancelledAt,
      },
    });

    if (result.count === 0) {
      throw new ConflictError('Reservation was modified by another process. Please retry.', {
        reservationId: data.id,
      });
    }
  },

  /**
   * Reservation yükle (domain entity olarak).
   */
  async findById(id: string): Promise<Reservation | null> {
    const record = await prisma.reservation.findUnique({
      where: { id },
      include: {
        seatHolds: true,
        event: { select: { startsAt: true } },
      },
    });

    if (!record) return null;

    const seatHolds = record.seatHolds.map((sh) =>
      SeatHold.fromPersistence({
        seatHoldId: sh.id,
        eventId: sh.eventId,
        sectionName: sh.sectionName,
        row: sh.row,
        seat: sh.seat,
        priceInCents: sh.priceInCents,
        expiresAt: record.expiresAt,
      }),
    );

    return Reservation.fromPersistence({
      id: record.id,
      userId: record.userId,
      eventId: record.eventId,
      status: record.status as ReservationStatus,
      seatHolds,
      totalPrice: Money.fromCents(record.totalPriceInCents),
      version: record.version,
      expiresAt: record.expiresAt,
      eventStartsAt: record.event.startsAt,
      confirmedAt: record.confirmedAt ?? undefined,
      cancelledAt: record.cancelledAt ?? undefined,
      createdAt: record.createdAt,
    });
  },

  /**
   * Koltuğu serbest bırak (RELEASED).
   */
  async releaseSeats(reservationId: string): Promise<void> {
    await prisma.seatHold.updateMany({
      where: { reservationId },
      data: { status: 'RELEASED' },
    });
  },

  /**
   * Koltukları onayla (CONFIRMED).
   */
  async confirmSeats(reservationId: string): Promise<void> {
    await prisma.seatHold.updateMany({
      where: { reservationId },
      data: { status: 'CONFIRMED' },
    });
  },

  /**
   * Kullanıcının bir etkinlikteki toplam bilet sayısını getir (scalping kontrolü).
   */
  async getUserSeatCount(userId: string, eventId: string): Promise<number> {
    const count = await prisma.seatHold.count({
      where: {
        eventId,
        reservation: {
          userId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        status: { in: ['HELD', 'CONFIRMED'] },
      },
    });
    return count;
  },

  /**
   * Koltuk müsait mi? (aktif hold var mı?)
   */
  async isSeatAvailable(
    eventId: string,
    sectionName: string,
    row: number,
    seat: number,
  ): Promise<boolean> {
    const existing = await prisma.seatHold.findFirst({
      where: {
        eventId,
        sectionName,
        row,
        seat,
        status: { in: ['HELD', 'CONFIRMED'] },
      },
    });
    return !existing;
  },
};
