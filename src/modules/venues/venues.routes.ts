/**
 * Venues Module — Route Definitions
 */

import type { FastifyInstance } from 'fastify';
import { authorize } from '../../shared/middleware/auth.js';
import { createVenueSchema, updateVenueSchema, venueQuerySchema } from './venues.schema.js';
import { venuesService } from './venues.service.js';

export async function venueRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/venues ── (Public)
  app.get('/', { config: { public: true } }, async (request, reply) => {
    const query = venueQuerySchema.parse(request.query);
    const result = await venuesService.findMany(query);
    return reply.send(result);
  });

  // ── GET /api/v1/venues/:id ── (Public)
  app.get('/:id', { config: { public: true } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const venue = await venuesService.findById(id);
    return reply.send({ data: venue });
  });

  // ── POST /api/v1/venues ── (ADMIN only)
  app.post('/', { preHandler: [authorize('ADMIN')] }, async (request, reply) => {
    const input = createVenueSchema.parse(request.body);
    const venue = await venuesService.create(input);
    return reply.status(201).send({ data: venue });
  });

  // ── PATCH /api/v1/venues/:id ── (ADMIN only)
  app.patch('/:id', { preHandler: [authorize('ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateVenueSchema.parse(request.body);
    const venue = await venuesService.update(id, input);
    return reply.send({ data: venue });
  });

  // ── DELETE /api/v1/venues/:id ── (ADMIN only — soft delete)
  app.delete('/:id', { preHandler: [authorize('ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await venuesService.remove(id);
    return reply.status(204).send();
  });
}
