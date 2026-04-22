/**
 * Tickets Module — QR Kodlu E-Bilet Üretimi ve Doğrulama
 *
 * Bu modül ne yapıyor: Ödeme onaylandığında QR bilet üret, kapıda doğrula.
 * Hangi pattern: Basit service + HMAC crypto.
 * Neden: Sahte bilet üretimini engellemek (HMAC), çift kullanımı engellemek (status check).
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { NotFoundError, ValidationError } from '../../shared/errors/http-errors.js';
import { logger } from '../../shared/logger/index.js';
import { generateQRImage, generateQRPayload, verifyQRPayload } from './qr-generator.js';

export const ticketsService = {
  /**
   * Reservation onaylandığında bilet üret.
   * Her SeatHold için ayrı bir Ticket (QR) oluşturulur.
   * ReservationConfirmed event handler tarafından çağrılır (async).
   */
  async generateTickets(reservationId: string): Promise<void> {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { seatHolds: true },
    });

    if (!reservation) throw new NotFoundError('Reservation', reservationId);

    for (const seatHold of reservation.seatHolds) {
      // QR payload oluştur (HMAC signed)
      const qrPayload = generateQRPayload({
        ticketId: seatHold.id, // SeatHold ID = Ticket ID (1:1)
        eventId: reservation.eventId,
        sectionName: seatHold.sectionName,
        row: seatHold.row,
        seat: seatHold.seat,
      });

      await prisma.ticket.create({
        data: {
          reservationId: reservation.id,
          seatHoldId: seatHold.id,
          userId: reservation.userId,
          qrPayload,
        },
      });
    }

    logger.info({ reservationId, ticketCount: reservation.seatHolds.length }, 'Tickets generated');
  },

  /**
   * Kullanıcının tüm biletlerini listele (en yeniden eskiye).
   */
  async listForUser(userId: string) {
    const tickets = await prisma.ticket.findMany({
      where: { userId },
      include: {
        seatHold: true,
        reservation: {
          include: { event: { select: { id: true, name: true, startsAt: true, posterUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((t) => ({
      id: t.id,
      status: t.status,
      qrPayload: t.qrPayload,
      createdAt: t.createdAt.toISOString(),
      usedAt: t.usedAt?.toISOString() ?? null,
      event: {
        id: t.reservation.event.id,
        name: t.reservation.event.name,
        startsAt: t.reservation.event.startsAt.toISOString(),
        posterUrl: t.reservation.event.posterUrl,
      },
      seat: {
        section: t.seatHold.sectionName,
        row: t.seatHold.row,
        seat: t.seatHold.seat,
      },
    }));
  },

  /**
   * Bilet detayı getir (kullanıcı kendi biletini görür).
   */
  async getTicket(ticketId: string, userId: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        seatHold: true,
        reservation: {
          include: { event: { select: { name: true, startsAt: true } } },
        },
      },
    });

    if (!ticket) throw new NotFoundError('Ticket', ticketId);
    if (ticket.userId !== userId) {
      throw new ValidationError('This ticket does not belong to you');
    }

    return {
      id: ticket.id,
      reservationId: ticket.reservationId,
      status: ticket.status,
      qrPayload: ticket.qrPayload,
      createdAt: ticket.createdAt.toISOString(),
      event: {
        name: ticket.reservation.event.name,
        startsAt: ticket.reservation.event.startsAt.toISOString(),
      },
      seat: {
        section: ticket.seatHold.sectionName,
        row: ticket.seatHold.row,
        seat: ticket.seatHold.seat,
      },
      usedAt: ticket.usedAt?.toISOString() ?? null,
    };
  },

  /**
   * QR kod PNG resmi oluştur.
   */
  async getTicketQRImage(ticketId: string, userId: string): Promise<Buffer> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) throw new NotFoundError('Ticket', ticketId);
    if (ticket.userId !== userId) {
      throw new ValidationError('This ticket does not belong to you');
    }

    return generateQRImage(ticket.qrPayload);
  },

  /**
   * Kapıda QR doğrulama.
   *
   * 1. HMAC signature doğrula (sahte bilet kontrolü)
   * 2. DB'de ticket var mı kontrol et
   * 3. Status: VALID mi? (USED veya REVOKED değil mi?)
   * 4. İlk kullanımda USED olarak işaretle
   * 5. İkinci okutmada "zaten kullanılmış" hatası
   */
  async validateTicket(qrPayload: string): Promise<{
    valid: boolean;
    ticketId?: string;
    message: string;
    seatInfo?: { section: string; row: number; seat: number };
  }> {
    // 1. HMAC doğrula
    const verification = verifyQRPayload(qrPayload);
    if (!verification.valid || !verification.data) {
      return { valid: false, message: 'Invalid or tampered QR code' };
    }

    // 2. DB'de bul
    const ticket = await prisma.ticket.findFirst({
      where: { qrPayload },
      include: { seatHold: true },
    });

    if (!ticket) {
      return { valid: false, message: 'Ticket not found in system' };
    }

    // 3. Status kontrol
    if (ticket.status === 'REVOKED') {
      return {
        valid: false,
        ticketId: ticket.id,
        message: 'This ticket has been revoked',
      };
    }

    if (ticket.status === 'USED') {
      return {
        valid: false,
        ticketId: ticket.id,
        message: `Ticket already used at ${ticket.usedAt?.toISOString()}`,
      };
    }

    // 4. İlk kullanım — USED olarak işaretle
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED', usedAt: new Date() },
    });

    logger.info({ ticketId: ticket.id }, 'Ticket validated and used');

    return {
      valid: true,
      ticketId: ticket.id,
      message: 'Valid ticket — welcome!',
      seatInfo: {
        section: ticket.seatHold.sectionName,
        row: ticket.seatHold.row,
        seat: ticket.seatHold.seat,
      },
    };
  },
};
