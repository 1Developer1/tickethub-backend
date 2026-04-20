/**
 * Events Module — Route Definitions
 *
 * Arama ve listeleme: Public (herkes)
 * Oluşturma/güncelleme: ORGANIZER veya ADMIN
 */

import type { FastifyInstance } from 'fastify';
import { eventsService } from './events.service.js';
import { createEventSchema, updateEventSchema, eventQuerySchema } from './events.schema.js';
import { authorize } from '../../shared/middleware/auth.js';

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/events ── (Public — arama + filtreleme + pagination)
  app.get('/', { config: { public: true } }, async (request, reply) => {
    const query = eventQuerySchema.parse(request.query);
    const result = await eventsService.search(query);
    return reply.send(result);
  });

  // ── GET /api/v1/events/:id ── (Public — detay + Redis cache)
  app.get('/:id', { config: { public: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await eventsService.findById(id);
    return reply.send({ data: event });
  });

  // ── POST /api/v1/events ── (ORGANIZER veya ADMIN)
  app.post(
    '/',
    { preHandler: [authorize('ORGANIZER', 'ADMIN')] },
    async (request, reply) => {
      const input = createEventSchema.parse(request.body);
      const event = await eventsService.create(request.user!.sub, input);
      return reply.status(201).send({ data: event });
    },
  );

  // ── PATCH /api/v1/events/:id ── (Etkinlik sahibi veya ADMIN)
  app.patch(
    '/:id',
    { preHandler: [authorize('ORGANIZER', 'ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateEventSchema.parse(request.body);
      const event = await eventsService.update(id, request.user!.sub, request.user!.role, input);
      return reply.send({ data: event });
    },
  );

  // ── DELETE /api/v1/events/:id ── (Soft delete — etkinlik sahibi veya ADMIN)
  app.delete(
    '/:id',
    { preHandler: [authorize('ORGANIZER', 'ADMIN')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await eventsService.remove(id, request.user!.sub, request.user!.role);
      return reply.status(204).send();
    },
  );
}
