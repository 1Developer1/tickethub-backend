/**
 * Pricing Module — Route Definitions
 *
 * Güncel fiyat: Public (bilet fiyatlarını görmek için)
 * Fiyat ayarlama + geçmiş: ADMIN veya ORGANIZER
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize, requireUser } from '../../shared/middleware/auth.js';
import { pricingService } from './pricing.service.js';

const setBasePriceSchema = z.object({
  eventId: z.string().uuid(),
  sectionName: z.string().min(1).max(100),
  priceInCents: z.number().int().positive(),
});

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/pricing/:eventId ── (Public — güncel fiyatlar)
  app.get('/:eventId', { config: { public: true } }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const prices = await pricingService.getCurrentPrices(eventId);
    return reply.send({ data: prices });
  });

  // ── GET /api/v1/pricing/:eventId/history ── (Admin — fiyat geçmişi)
  app.get(
    '/:eventId/history',
    { preHandler: [authorize('ORGANIZER', 'ADMIN')] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const history = await pricingService.getPriceHistory(eventId);
      return reply.send({ data: history });
    },
  );

  // ── POST /api/v1/pricing/base-price ── (Admin — taban fiyat ayarla)
  app.post(
    '/base-price',
    { preHandler: [authorize('ORGANIZER', 'ADMIN')] },
    async (request, reply) => {
      const input = setBasePriceSchema.parse(request.body);
      await pricingService.setBasePrice({
        ...input,
        setBy: requireUser(request).sub,
      });
      return reply.status(201).send({ data: { message: 'Base price set' } });
    },
  );
}
