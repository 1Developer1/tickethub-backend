/**
 * Idempotency Middleware
 *
 * NEDEN İDEMPOTENCY?
 * Kullanıcı "Ödeme Yap" butonuna tıkladı → network timeout → "acaba gitti mi?" → tekrar tıklıyor.
 * İdempotency olmadan: iki ödeme alınır → kullanıcı çift ücret öder = felaket.
 * İdempotency ile: ikinci istek aynı Idempotency-Key ile gelir → cached response döner → tek ödeme.
 *
 * NASIL ÇALIŞIR?
 * 1. Client her POST isteğinde unique bir Idempotency-Key header'ı gönderir
 * 2. Server bu key'i Redis'te kontrol eder:
 *    - Key YOKSA: isteği işle, sonucu Redis'e kaydet (24 saat TTL)
 *    - Key VARSA: cached sonucu dön (isteği tekrar işleme)
 * 3. Key "processing" durumundaysa: 409 Conflict (önceki istek hâlâ işleniyor)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyCacheKey?: string;
  }
}
import { IDEMPOTENCY_TTL_SECONDS } from '../../config/constants.js';
import { ConflictError } from '../errors/http-errors.js';
import { logger } from '../logger/index.js';
import { redis } from '../redis/redis-client.js';

const IDEMPOTENCY_PREFIX = 'idempotency:';

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Idempotency guard — belirli route'larda kullan (özellikle payment).
 *
 * @example
 * app.post('/payments/charge', { preHandler: [idempotencyGuard] }, handler);
 */
export async function idempotencyGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

  // Idempotency-Key yoksa devam et (her route'ta zorunlu değil)
  if (!idempotencyKey) return;

  const cacheKey = `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
  const existing = await redis.get(cacheKey);

  if (existing) {
    const cached = JSON.parse(existing) as CachedResponse | 'processing';

    if (cached === 'processing') {
      throw new ConflictError('A request with this Idempotency-Key is already being processed');
    }

    // Cached response dön — isteği tekrar işleme
    logger.debug({ idempotencyKey }, 'Returning cached idempotent response');
    reply.status(cached.statusCode).send(cached.body);
    return;
  }

  // "Processing" durumunu kaydet (race condition önlemi)
  await redis.setex(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify('processing'));

  // Response sonrası sonucu cache'le — onResponse hook kullan
  request.idempotencyCacheKey = cacheKey;
}
