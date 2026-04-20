/**
 * Rate Limiting Configuration
 *
 * NEDEN RATE LIMITING?
 * 1. DDoS koruması: bir IP'den saniyede 10.000 istek → sunucu çöker
 * 2. Brute force koruması: login endpoint'te sınırsız deneme → şifre kırılır
 * 3. Bot koruması: otomatik bilet alım scriptleri (scalping botu)
 * 4. Fair use: bir kullanıcı tüm kapasiteyi tüketemesin
 *
 * NEDEN REDIS STORE?
 * In-memory store tek process'te çalışır. Birden fazla server instance varsa
 * (load balancer arkasında) her instance ayrı sayaç tutar → limit bypass edilir.
 * Redis store ile: tüm instance'lar aynı sayacı paylaşır.
 */

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { redis } from '../redis/redis-client.js';

export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    redis,
    // Rate limit aşıldığında dönecek response
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${context.max} per ${context.after}`,
      },
    }),
    // IP bazlı (X-Forwarded-For header'ı destekle — load balancer arkasında)
    keyGenerator: (request) => {
      return (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? request.ip;
    },
  });
}
