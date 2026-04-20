/**
 * Pricing Events — Append-Only Event Definitions
 *
 * NEDEN EVENT SOURCING LITE?
 * "Bu fiyat neden bu?" sorusuna cevap verebilmek ZORUNLU.
 * Regülasyon: bilet platformları fiyat değişikliği geçmişi tutmalı.
 * Müşteri şikayeti: "Dün 200 TL idi, bugün 750 TL — neden?"
 *
 * Event sourcing ile: tüm fiyat değişiklikleri kronolojik sırada saklanır.
 * Event'leri baştan sona replay'leyerek şu anki fiyata nasıl ulaşıldığını gösterebiliriz.
 *
 * NEDEN TAM EVENT SOURCING FRAMEWORK DEĞİL?
 * EventStoreDB, Marten gibi framework'ler:
 * - Ayrı event store, projection engine, snapshot mekanizması
 * - Operasyonel karmaşıklık (yeni bir veritabanı yönetmek)
 * - Sadece pricing modülünde event sourcing var — tüm sisteme yaymak gereksiz
 * - PostgreSQL'de append-only tablo + basit projeksiyon yeterli
 * - Gerekirse ileride geçiş yapılabilir (event format zaten tanımlı)
 */

// ── Event Types ──
export interface BasePriceSetEvent {
  type: 'BASE_PRICE_SET';
  eventId: string;
  sectionName: string;
  priceInCents: number;
  setBy: string; // Admin user ID
}

export interface SurgeAppliedEvent {
  type: 'SURGE_APPLIED';
  eventId: string;
  sectionName: string;
  multiplier: number;
  reason: 'HIGH_DEMAND' | 'LOW_AVAILABILITY' | 'LAST_MINUTE';
  previousPriceInCents: number;
  newPriceInCents: number;
}

export interface DiscountAppliedEvent {
  type: 'DISCOUNT_APPLIED';
  eventId: string;
  sectionName: string;
  discountPercent: number;
  reason: 'EARLY_BIRD' | 'PROMO_CODE';
  previousPriceInCents: number;
  newPriceInCents: number;
}

export interface PriceAdjustedEvent {
  type: 'PRICE_ADJUSTED';
  eventId: string;
  sectionName: string;
  previousPriceInCents: number;
  newPriceInCents: number;
  reason: string;
  adjustedBy: string; // Admin or system
}

export type PricingDomainEvent =
  | BasePriceSetEvent
  | SurgeAppliedEvent
  | DiscountAppliedEvent
  | PriceAdjustedEvent;

/**
 * Event'ten güncel fiyatı hesapla.
 * Event replay'de kullanılır: tüm event'leri sırayla geç, son durumu hesapla.
 */
export function replayPricingEvents(events: PricingDomainEvent[]): {
  basePriceInCents: number;
  currentPriceInCents: number;
  multiplier: number;
} {
  let basePriceInCents = 0;
  let currentPriceInCents = 0;
  let multiplier = 1.0;

  for (const event of events) {
    switch (event.type) {
      case 'BASE_PRICE_SET':
        basePriceInCents = event.priceInCents;
        currentPriceInCents = event.priceInCents;
        multiplier = 1.0;
        break;
      case 'SURGE_APPLIED':
        multiplier = event.multiplier;
        currentPriceInCents = event.newPriceInCents;
        break;
      case 'DISCOUNT_APPLIED':
        currentPriceInCents = event.newPriceInCents;
        break;
      case 'PRICE_ADJUSTED':
        currentPriceInCents = event.newPriceInCents;
        break;
    }
  }

  return { basePriceInCents, currentPriceInCents, multiplier };
}
