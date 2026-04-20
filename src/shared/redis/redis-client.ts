/**
 * Redis Client — ioredis Singleton
 *
 * NEDEN REDIS BİRDEN FAZLA ROL OYNUYOR?
 * Redis tek bir araç ama farklı amaçlarla kullanılıyor:
 *
 * 1. CACHE: Etkinlik detayı, güncel fiyat → DB yükünü azalt (okuma: ~0.1ms vs DB ~5ms)
 * 2. DISTRIBUTED LOCK (Redlock): Koltuk seçiminde race condition önle
 * 3. JOB QUEUE BACKEND (BullMQ): Reservation expire, email gönderimi
 * 4. IDEMPOTENCY: Ödeme duplicate kontrolü
 * 5. SESSION/TOKEN: Refresh token blacklist, ticket "already used" kontrolü
 *
 * NEDEN AYRI İNSTANCE'LAR?
 * BullMQ kendi connection'ını ister (blocking command'lar kullanır — BRPOPLPUSH).
 * Cache connection'ı ile aynı instance kullanırsan, BullMQ'nun blocking call'ı
 * cache okumalarını bloklar.
 *
 * NEDEN ioredis?
 * BullMQ ioredis GEREKTİRİR (node-redis desteklenmiyor).
 */

import { Redis } from 'ioredis';
import { logger } from '../logger/index.js';

function createRedisClient(name: string): Redis {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const client = new Redis({
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ attempt: times, delay, clientName: name }, 'Redis reconnecting...');
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('connect', () => {
    logger.info({ clientName: name }, 'Redis connected');
  });

  client.on('error', (err: Error) => {
    logger.error({ err, clientName: name }, 'Redis connection error');
  });

  return client;
}

/** Ana Redis client — cache, lock, idempotency, session */
export const redis = createRedisClient('main');

/** BullMQ dedicated connection — job queue operations */
export const bullmqRedis = createRedisClient('bullmq');

/**
 * Tüm Redis bağlantılarını kapat.
 */
export async function disconnectRedis(): Promise<void> {
  await Promise.all([redis.quit(), bullmqRedis.quit()]);
  logger.info('Redis connections closed');
}
