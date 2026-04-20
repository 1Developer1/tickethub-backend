/**
 * Redis Cache Wrapper — Typed Cache-Aside Pattern
 *
 * NEDEN CACHE?
 * Etkinlik detay sayfası: 100.000 kişi aynı anda bakıyor → her biri DB sorgusu yaparsa
 * PostgreSQL çöker. Redis'te cache'le → %99'u Redis'ten oku (~0.1ms), DB'ye sadece cache miss gider.
 *
 * CACHE-ASIDE PATTERN:
 * 1. Cache'ten oku → varsa dön (HIT)
 * 2. Yoksa DB'den oku → cache'e yaz → dön (MISS)
 * 3. Veri değiştiğinde cache'i invalidate et (DEL)
 *
 * NEDEN PREFIX?
 * Redis tek bir key space → farklı modüller aynı "id" kullanabilir.
 * Prefix ile: "event:123", "price:456" → çakışma olmaz.
 */

import { redis } from './redis-client.js';
import { logger } from '../logger/index.js';

export const cache = {
  /**
   * Cache'ten oku. Yoksa null döner.
   */
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (data === null) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      // Corrupt veri → sil, null dön
      await redis.del(key);
      return null;
    }
  },

  /**
   * Cache'e yaz. TTL saniye cinsinden.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const data = JSON.stringify(value);
    await redis.setex(key, ttlSeconds, data);
  },

  /**
   * Cache'i sil. Veri değiştiğinde invalidate etmek için.
   */
  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  /**
   * Pattern ile birden fazla key sil.
   * Örnek: invalidatePattern('event:*') → tüm etkinlik cache'lerini temizle
   *
   * DİKKAT: KEYS komutu production'da TEHLİKELİ (tüm key space'i tarar).
   * SCAN kullanıyoruz — incremental, non-blocking.
   */
  async delPattern(pattern: string): Promise<void> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    if (deletedCount > 0) {
      logger.debug({ pattern, deletedCount }, 'Cache pattern invalidated');
    }
  },

  /**
   * Cache-Aside: cache'te varsa dön, yoksa factory'den al, cache'e yaz, dön.
   * Bu en sık kullanılan pattern — DB sorgusu sarmala.
   *
   * @example
   * const event = await cache.getOrSet(
   *   `event:${id}`,
   *   () => eventRepository.findById(id),
   *   CACHE_TTL.EVENT_DETAIL
   * );
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    // null/undefined'ı cache'leme — "not found" sonuçları kısa süreliğine cache'lenebilir
    // ama bu projede "not found" → NotFoundError fırlatıyoruz zaten
    if (value !== null && value !== undefined) {
      await cache.set(key, value, ttlSeconds);
    }
    return value;
  },
};
