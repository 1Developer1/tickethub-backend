/**
 * Fastify Application Factory
 *
 * NEDEN FASTIFY?
 * - Express'ten ~2x hızlı (benchmark: 70k req/s vs 35k req/s)
 * - Schema-based validation: route tanımında JSON Schema ile otomatik validation
 * - Encapsulation: plugin sistemi ile modüller birbirinden izole
 * - TypeScript-first: tip desteği native, Express gibi @types paketi gerekmez
 * - Pino integration: logging sıfır overhead ile built-in
 *
 * NE ZAMAN EXPRESS DAHA İYİ?
 * - Ekip Express'e çok hakim ve Fastify öğrenme maliyeti yüksekse
 * - Çok fazla Express middleware'e bağımlı legacy proje varsa
 * - Performans kritik değilse (internal tool, düşük trafik)
 *
 * NEDEN FACTORY PATTERN (buildApp fonksiyonu)?
 * Test'te aynı app'i farklı config'le oluşturabilmek için.
 * main.ts'de: buildApp() → listen. Test'te: buildApp() → supertest.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { logger } from './shared/logger/index.js';
import { errorHandler } from './shared/errors/error-handler.js';
import { requestIdPlugin } from './shared/middleware/request-id.js';
import { authPlugin } from './shared/middleware/auth.js';
import { rateLimitPlugin } from './shared/middleware/rate-limit.js';
import { healthRoutes } from './shared/health/routes.js';
import { API_PREFIX } from './config/constants.js';

// Module routes
import { userRoutes } from './modules/users/users.routes.js';
import { venueRoutes } from './modules/venues/venues.routes.js';
import { eventRoutes } from './modules/events/events.routes.js';
import { pricingRoutes } from './modules/pricing/pricing.routes.js';
import { bookingRoutes } from './modules/booking/booking.routes.js';
import { paymentRoutes } from './modules/payments/payments.routes.js';
import { ticketRoutes } from './modules/tickets/tickets.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    // Request ID'yi Fastify'ın kendi mekanizması ile üret
    genReqId: (req) => {
      return (req.headers['x-request-id'] as string) || crypto.randomUUID();
    },
    // Body size limit: 1MB (büyük payload'ları reddet — DDoS koruması)
    bodyLimit: 1_048_576,
  });

  // ── Security Plugins ──
  // Helmet: güvenlik header'ları (X-Content-Type-Options, X-Frame-Options, vb.)
  await app.register(helmet, {
    // API olduğu için CSP devre dışı (frontend yok)
    contentSecurityPolicy: false,
  });

  // CORS: sadece frontend domain'inden gelen isteklere izin ver
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  });

  // ── Middleware ──
  await app.register(requestIdPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  // ── Error Handler ──
  app.setErrorHandler(errorHandler);

  // ── Health Check (root level, no prefix) ──
  await app.register(healthRoutes);

  // ── API Routes ──
  await app.register(
    async (api) => {
      await api.register(userRoutes, { prefix: '/auth' });
      await api.register(venueRoutes, { prefix: '/venues' });
      await api.register(eventRoutes, { prefix: '/events' });
      await api.register(pricingRoutes, { prefix: '/pricing' });
      await api.register(bookingRoutes, { prefix: '/bookings' });
      await api.register(paymentRoutes, { prefix: '/payments' });
      await api.register(ticketRoutes, { prefix: '/tickets' });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
