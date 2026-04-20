/**
 * Users Module — Route Definitions
 *
 * Auth endpoint'leri public (token gerekmez), profil endpoint'i protected.
 *
 * Rate limiting: Login endpoint'te IP bazlı 5 deneme/dakika.
 * Neden? Brute force saldırısını yavaşlatmak için. Saldırgan saniyede 1000 şifre denemek yerine
 * dakikada 5 ile sınırlı → şifre kırmak pratikte imkansız.
 */

import type { FastifyInstance } from 'fastify';
import { usersService } from './users.service.js';
import { registerSchema, loginSchema, refreshSchema } from './users.schema.js';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/auth/register ──
  app.post(
    '/register',
    { config: { public: true } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);
      const result = await usersService.register(input);
      return reply.status(201).send({ data: result });
    },
  );

  // ── POST /api/v1/auth/login ──
  // Rate limit: 5 deneme/dakika (brute force koruması)
  app.post(
    '/login',
    {
      config: {
        public: true,
        rateLimit: { max: 5, timeWindow: '1 minute' },
      } as Record<string, unknown>,
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const result = await usersService.login(input);
      return reply.send({ data: result });
    },
  );

  // ── POST /api/v1/auth/refresh ──
  app.post(
    '/refresh',
    { config: { public: true } },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse(request.body);
      const tokens = await usersService.refresh(refreshToken);
      return reply.send({ data: tokens });
    },
  );

  // ── POST /api/v1/auth/logout ──
  app.post(
    '/logout',
    { config: { public: true } },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse(request.body);
      await usersService.logout(refreshToken);
      return reply.status(204).send();
    },
  );

  // ── GET /api/v1/auth/me ──
  // Protected endpoint — JWT access token gerekli
  app.get('/me', async (request, reply) => {
    const userId = request.user!.sub;
    const profile = await usersService.getProfile(userId);
    return reply.send({ data: profile });
  });
}
