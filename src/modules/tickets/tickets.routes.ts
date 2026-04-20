/**
 * Tickets Module — Route Definitions
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize, requireUser } from '../../shared/middleware/auth.js';
import { ticketsService } from './tickets.service.js';

const validateSchema = z.object({
  qrPayload: z.string().min(1),
});

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/tickets/:id ── (Bilet detayı — bilet sahibi)
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await ticketsService.getTicket(id, requireUser(request).sub);
    return reply.send({ data: ticket });
  });

  // ── GET /api/v1/tickets/:id/qr ── (QR kod PNG — bilet sahibi)
  app.get('/:id/qr', async (request, reply) => {
    const { id } = request.params as { id: string };
    const qrBuffer = await ticketsService.getTicketQRImage(id, requireUser(request).sub);
    return reply.type('image/png').send(qrBuffer);
  });

  // ── POST /api/v1/tickets/validate ── (Kapıda QR doğrulama — ADMIN role)
  app.post('/validate', { preHandler: [authorize('ADMIN')] }, async (request, reply) => {
    const { qrPayload } = validateSchema.parse(request.body);
    const result = await ticketsService.validateTicket(qrPayload);
    return reply.send({ data: result });
  });
}
