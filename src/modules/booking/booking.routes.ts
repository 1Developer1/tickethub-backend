/**
 * Booking Module — Route Definitions
 *
 * Tüm booking endpoint'leri authentication gerektirir.
 * Rate limit: hold endpoint'te 20/dakika (bot koruması).
 */

import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../shared/middleware/auth.js';
import { confirmReservationSchema, createReservationSchema } from './booking.schema.js';
import { bookingService } from './booking.service.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/bookings/hold ── (Koltuk tut — 10 dk)
  app.post(
    '/hold',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      } as Record<string, unknown>,
    },
    async (request, reply) => {
      const input = createReservationSchema.parse(request.body);
      const result = await bookingService.createReservation(requireUser(request).sub, input);
      return reply.status(201).send({ data: result });
    },
  );

  // ── GET /api/v1/bookings/:id ── (Reservation detayı)
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await bookingService.getReservation(requireUser(request).sub, id);
    return reply.send({ data: result });
  });

  // ── POST /api/v1/bookings/:id/confirm ── (Ödeme sonrası onayla)
  app.post('/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { paymentId } = confirmReservationSchema.parse(request.body);
    const result = await bookingService.confirmReservation(requireUser(request).sub, id, paymentId);
    return reply.send({ data: result });
  });

  // ── POST /api/v1/bookings/:id/cancel ── (İptal)
  app.post('/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await bookingService.cancelReservation(requireUser(request).sub, id);
    return reply.send({ data: result });
  });

  // ── DELETE /api/v1/bookings/:id/hold ── (Hold'u iptal et — kullanıcı vazgeçti)
  app.delete('/:id/hold', async (request, reply) => {
    const { id } = request.params as { id: string };
    await bookingService.cancelReservation(requireUser(request).sub, id);
    return reply.status(204).send();
  });
}
