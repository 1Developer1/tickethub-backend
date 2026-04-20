/**
 * Current Price Projection
 *
 * Event'lerden hesaplanmış güncel fiyat.
 * Her zaman pricing_events tablosundan yeniden oluşturulabilir (rebuild).
 *
 * NEDEN PROJEKSİYON?
 * Event sourcing'de "şu anki durum" event'lerin replay'inden elde edilir.
 * Her okumada tüm event'leri replay'lemek yavaş (100 event × her okuma = O(N)).
 * Projeksiyon: event'ler yazıldığında güncel durumu ayrı tabloya yaz → okuma O(1).
 *
 * NEDEN Redis CACHE ÜZERİNE?
 * DB projeksiyonu: kaynak truth (event'lerden rebuild edilebilir).
 * Redis cache: performans optimizasyonu (30s TTL).
 * İkisi birlikte: Redis cache → miss → DB projeksiyon → miss → event replay.
 */

import { CACHE_TTL } from '../../../config/constants.js';
import { logger } from '../../../shared/logger/index.js';
import { cache } from '../../../shared/redis/cache.js';
import { type PricingDomainEvent, replayPricingEvents } from '../domain/pricing.events.js';
import { pricingRepository } from '../pricing.repository.js';

const CACHE_PREFIX = 'price:current:';

export const currentPriceProjection = {
  /**
   * Projeksiyon rebuild: tüm event'leri replay'le, güncel fiyatı hesapla, DB + cache'e yaz.
   */
  async rebuild(
    eventId: string,
    sectionName: string,
  ): Promise<{
    basePriceInCents: number;
    currentPriceInCents: number;
    multiplier: number;
  }> {
    const events = await pricingRepository.getEventsForSection(eventId, sectionName);

    const domainEvents = events.map((e) => ({
      type: e.type,
      ...(e.payload as Record<string, unknown>),
      eventId: e.eventId,
      sectionName: e.sectionName,
    })) as PricingDomainEvent[];

    const result = replayPricingEvents(domainEvents);

    // DB projeksiyonunu güncelle
    await pricingRepository.upsertCurrentPrice({
      eventId,
      sectionName,
      ...result,
    });

    // Redis cache'i güncelle
    const cacheKey = `${CACHE_PREFIX}${eventId}:${sectionName}`;
    await cache.set(cacheKey, result, CACHE_TTL.CURRENT_PRICE);

    logger.debug({ eventId, sectionName, ...result }, 'Price projection rebuilt');

    return result;
  },

  /**
   * Güncel fiyatı getir: Redis cache → DB projeksiyon → event replay.
   */
  async get(
    eventId: string,
    sectionName: string,
  ): Promise<{
    basePriceInCents: number;
    currentPriceInCents: number;
    multiplier: number;
  } | null> {
    const cacheKey = `${CACHE_PREFIX}${eventId}:${sectionName}`;

    // 1. Redis cache
    const cached = await cache.get<{
      basePriceInCents: number;
      currentPriceInCents: number;
      multiplier: number;
    }>(cacheKey);

    if (cached) return cached;

    // 2. DB projeksiyon
    const dbPrice = await pricingRepository.getCurrentPrice(eventId, sectionName);

    if (dbPrice) {
      const result = {
        basePriceInCents: dbPrice.basePriceInCents,
        currentPriceInCents: dbPrice.currentPriceInCents,
        multiplier: dbPrice.multiplier,
      };
      await cache.set(cacheKey, result, CACHE_TTL.CURRENT_PRICE);
      return result;
    }

    // 3. Event replay (projeksiyon henüz oluşturulmamışsa)
    return currentPriceProjection.rebuild(eventId, sectionName);
  },

  /**
   * Cache invalidate — fiyat değiştiğinde çağır.
   */
  async invalidate(eventId: string, sectionName: string): Promise<void> {
    await cache.del(`${CACHE_PREFIX}${eventId}:${sectionName}`);
  },
};
