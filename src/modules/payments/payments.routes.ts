/**
 * Payments Module — Route Definitions
 *
 * Charge: Authenticated + Idempotency-Key header
 * Webhook: Public (signature ile doğrulanır)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idempotencyGuard } from '../../shared/middleware/idempotency.js';
import { paymentsService } from './payments.service.js';

const chargeSchema = z.object({
  reservationId: z.string().uuid(),
  amountInCents: z.number().int().positive(),
  currency: z.string().default('TRY'),
});

const refundSchema = z.object({
  reservationId: z.string().uuid(),
  amountInCents: z.number().int().positive().optional(),
});

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/payments/charge ── (Idempotency-Key zorunlu önerilir)
  app.post('/charge', { preHandler: [idempotencyGuard] }, async (request, reply) => {
    const input = chargeSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const result = await paymentsService.charge({ ...input, idempotencyKey });
    return reply.status(201).send({ data: result });
  });

  // ── POST /api/v1/payments/refund ──
  app.post('/refund', async (request, reply) => {
    const input = refundSchema.parse(request.body);
    const result = await paymentsService.refund(input);
    return reply.send({ data: result });
  });

  // ── POST /api/v1/payments/webhooks/stripe ── (Public — signature verified)
  // Webhook route: raw body gerekli (Stripe signature verification)
  app.post(
    '/webhooks/stripe',
    {
      config: { public: true, rawBody: true } as Record<string, unknown>,
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;
      const payload =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      await paymentsService.handleWebhook(payload, signature);
      return reply.status(200).send({ received: true });
    },
  );
}
