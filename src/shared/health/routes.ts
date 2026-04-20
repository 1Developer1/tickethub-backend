/**
 * Health Check Endpoint
 *
 * NEDEN HEALTH CHECK?
 * - Docker HEALTHCHECK: container sağlık durumunu kontrol eder, unhealthy ise restart
 * - Load balancer: sağlıksız instance'a trafik yönlendirme
 * - Monitoring: uptime tracking, alerting
 *
 * Sadece "200 OK" dönmek yetmez — DB ve Redis bağlantılarını da kontrol et.
 * Uygulama çalışıyor ama DB bağlantısı kopmuşsa, "healthy" DEĞİL.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../database/prisma-client.js';
import { redis } from '../redis/redis-client.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    { config: { public: true } },
    async (_request, reply) => {
      const checks = {
        database: 'error' as 'ok' | 'error',
        redis: 'error' as 'ok' | 'error',
      };

      // PostgreSQL bağlantı kontrolü
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        checks.database = 'ok';
      } catch {
        // DB bağlantısı yok
      }

      // Redis bağlantı kontrolü
      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        // Redis bağlantısı yok
      }

      const allOk = checks.database === 'ok' && checks.redis === 'ok';
      const anyOk = checks.database === 'ok' || checks.redis === 'ok';

      const response: HealthStatus = {
        status: allOk ? 'healthy' : anyOk ? 'degraded' : 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        checks,
      };

      const statusCode = allOk ? 200 : 503;
      reply.status(statusCode).send(response);
    },
  );
}
