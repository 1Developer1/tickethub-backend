/**
 * Pricing Module — Dynamic Pricing Service
 *
 * Bu modül ne yapıyor: Dinamik fiyatlama — talep/zaman bazlı fiyat değişikliği + tam geçmiş.
 * Hangi pattern: Event sourcing lite (append-only event tablo + projeksiyonlar).
 * Neden event sourcing: "Bu fiyat neden bu?" sorusuna cevap verebilmek.
 *   Normal CRUD'da (UPDATE) önceki değer kaybolur. Event sourcing'de her değişiklik kayıtlı.
 *
 * DİNAMİK FİYATLAMA KURALLARI:
 * 1. Kalan koltuk < %20 → 1.3x surge (yüksek talep)
 * 2. Kalan koltuk < %5 → 1.8x surge (kritik talep)
 * 3. Etkinliğe 7 günden az → 1.2x last-minute surge
 * 4. Satışın ilk 48 saati → %15 early bird indirimi
 * 5. Min/max fiyat sınırları (admin tarafından)
 *
 * ❌ ANTI-PATTERN: Integer yerine float ile para hesaplama
 * ```
 * const price = 19.99;
 * const total = price * 3; // 59.97000000000001 (floating point hatası!)
 * // Kullanıcı 59.97 TL bekliyor ama 59.97000000000001 görüyor
 * // Veya daha kötüsü: hesaplama farklı tutarlarda uyuşmazlık
 * ```
 *
 * ✅ DOĞRU: Integer cents
 * ```
 * const priceInCents = 1999; // 19.99 TL
 * const total = priceInCents * 3; // 5997 cents = 59.97 TL (TAM DOĞRU)
 * // Gösterimde: (total / 100).toFixed(2) → "59.97"
 * ```
 */

import { pricingRepository } from './pricing.repository.js';
import { currentPriceProjection } from './projections/current-price.projection.js';
import { priceHistoryProjection } from './projections/price-history.projection.js';
import { NotFoundError } from '../../shared/errors/http-errors.js';
import { PRICING_RULES } from '../../config/constants.js';
import { logger } from '../../shared/logger/index.js';

export const pricingService = {
  /**
   * Bölge taban fiyatını ayarla (ilk kez veya güncelleme).
   * Event: BASE_PRICE_SET
   */
  async setBasePrice(params: {
    eventId: string;
    sectionName: string;
    priceInCents: number;
    setBy: string;
  }): Promise<void> {
    await pricingRepository.appendEvent({
      eventId: params.eventId,
      sectionName: params.sectionName,
      type: 'BASE_PRICE_SET',
      payload: {
        type: 'BASE_PRICE_SET',
        eventId: params.eventId,
        sectionName: params.sectionName,
        priceInCents: params.priceInCents,
        setBy: params.setBy,
      },
    });

    // Projeksiyonu rebuild et
    await currentPriceProjection.rebuild(params.eventId, params.sectionName);

    logger.info(
      { eventId: params.eventId, section: params.sectionName, price: params.priceInCents },
      'Base price set',
    );
  },

  /**
   * Talep bazlı surge pricing uygula.
   * Koltuk müsaitlik oranına göre otomatik çağrılır.
   */
  async applySurge(params: {
    eventId: string;
    sectionName: string;
    availabilityPercent: number;
    daysUntilEvent: number;
  }): Promise<void> {
    const currentPrice = await currentPriceProjection.get(params.eventId, params.sectionName);
    if (!currentPrice) return;

    let multiplier = 1.0;
    let reason: string = '';

    // Koltuk bazlı surge
    if (params.availabilityPercent < PRICING_RULES.CRITICAL_AVAILABILITY_THRESHOLD) {
      multiplier = PRICING_RULES.CRITICAL_AVAILABILITY_MULTIPLIER; // 1.8x
      reason = 'LOW_AVAILABILITY';
    } else if (params.availabilityPercent < PRICING_RULES.LOW_AVAILABILITY_THRESHOLD) {
      multiplier = PRICING_RULES.LOW_AVAILABILITY_MULTIPLIER; // 1.3x
      reason = 'HIGH_DEMAND';
    }

    // Last-minute surge (koltuk surge'ın üzerine eklenir)
    if (params.daysUntilEvent < PRICING_RULES.LAST_MINUTE_DAYS) {
      multiplier *= PRICING_RULES.LAST_MINUTE_MULTIPLIER; // ×1.2
      reason = reason ? `${reason}+LAST_MINUTE` : 'LAST_MINUTE';
    }

    if (multiplier <= 1.0) return; // Surge gerekmiyor

    const newPriceInCents = Math.round(currentPrice.basePriceInCents * multiplier);

    await pricingRepository.appendEvent({
      eventId: params.eventId,
      sectionName: params.sectionName,
      type: 'SURGE_APPLIED',
      payload: {
        type: 'SURGE_APPLIED',
        eventId: params.eventId,
        sectionName: params.sectionName,
        multiplier,
        reason,
        previousPriceInCents: currentPrice.currentPriceInCents,
        newPriceInCents,
      },
    });

    await currentPriceProjection.rebuild(params.eventId, params.sectionName);

    logger.info(
      { eventId: params.eventId, section: params.sectionName, multiplier, reason },
      'Surge pricing applied',
    );
  },

  /**
   * Early bird indirimi uygula.
   * Satışın ilk 48 saatinde %15 indirim.
   */
  async applyEarlyBirdDiscount(params: {
    eventId: string;
    sectionName: string;
  }): Promise<void> {
    const currentPrice = await currentPriceProjection.get(params.eventId, params.sectionName);
    if (!currentPrice) return;

    const discountPercent = PRICING_RULES.EARLY_BIRD_DISCOUNT * 100; // 15
    const discount = Math.round(currentPrice.currentPriceInCents * PRICING_RULES.EARLY_BIRD_DISCOUNT);
    const newPriceInCents = currentPrice.currentPriceInCents - discount;

    await pricingRepository.appendEvent({
      eventId: params.eventId,
      sectionName: params.sectionName,
      type: 'EARLY_BIRD_APPLIED',
      payload: {
        type: 'DISCOUNT_APPLIED',
        eventId: params.eventId,
        sectionName: params.sectionName,
        discountPercent,
        reason: 'EARLY_BIRD',
        previousPriceInCents: currentPrice.currentPriceInCents,
        newPriceInCents,
      },
    });

    await currentPriceProjection.rebuild(params.eventId, params.sectionName);

    logger.info(
      { eventId: params.eventId, section: params.sectionName, discountPercent },
      'Early bird discount applied',
    );
  },

  /**
   * Güncel fiyat getir (public — bilet fiyatını göster).
   */
  async getCurrentPrices(eventId: string) {
    const prices = await pricingRepository.getCurrentPrices(eventId);
    if (prices.length === 0) {
      throw new NotFoundError('Pricing', eventId);
    }
    return prices.map((p) => ({
      sectionName: p.sectionName,
      basePriceInCents: p.basePriceInCents,
      currentPriceInCents: p.currentPriceInCents,
      multiplier: p.multiplier,
      // İnsan-okunabilir formatlar
      basePrice: `${(p.basePriceInCents / 100).toFixed(2)} TL`,
      currentPrice: `${(p.currentPriceInCents / 100).toFixed(2)} TL`,
    }));
  },

  /**
   * Fiyat değişiklik geçmişi (admin — "neden bu fiyat?").
   */
  async getPriceHistory(eventId: string) {
    return priceHistoryProjection.getHistory(eventId);
  },

  /**
   * Belirli bir bölgenin güncel fiyatını getir (booking modülü kullanır).
   */
  async getSectionPrice(eventId: string, sectionName: string): Promise<number> {
    const price = await currentPriceProjection.get(eventId, sectionName);
    if (!price) {
      throw new NotFoundError('Price', `${eventId}/${sectionName}`);
    }
    return price.currentPriceInCents;
  },
};
