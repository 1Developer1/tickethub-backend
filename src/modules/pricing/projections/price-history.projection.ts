/**
 * Price History Projection
 *
 * Admin raporu: "Bu bilet fiyatı neden 750 TL? Başta 200 TL'ydi!"
 * Cevap: Tüm fiyat değişikliklerini kronolojik sırada göster.
 *
 * Bu projeksiyon DB tablosu OLUŞTURMUYOR — doğrudan pricing_events tablosundan okuyor.
 * Neden? Geçmiş verisi zaten event'lerde var. Ayrı tablo gereksiz duplikasyon.
 * Sadece formatlama ve iş mantığı bu katmanda.
 */

import { pricingRepository } from '../pricing.repository.js';

export interface PriceHistoryEntry {
  id: string;
  type: string;
  sectionName: string;
  payload: Record<string, unknown>;
  timestamp: string;
  description: string;
}

export const priceHistoryProjection = {
  /**
   * Belirli bir etkinliğin fiyat değişiklik geçmişi (admin rapor).
   */
  async getHistory(eventId: string): Promise<PriceHistoryEntry[]> {
    const events = await pricingRepository.getEventsForEvent(eventId);

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      sectionName: event.sectionName,
      payload: event.payload as Record<string, unknown>,
      timestamp: event.createdAt.toISOString(),
      description: describeEvent(event.type, event.payload as Record<string, unknown>),
    }));
  },
};

/**
 * Event'i insan-okunabilir açıklamaya çevir.
 */
function describeEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'BASE_PRICE_SET':
      return `Base price set to ${formatCents(payload.priceInCents as number)}`;
    case 'SURGE_APPLIED':
      return `Surge pricing applied (${payload.multiplier}x) due to ${payload.reason}: ${formatCents(payload.previousPriceInCents as number)} → ${formatCents(payload.newPriceInCents as number)}`;
    case 'DISCOUNT_APPLIED':
      return `Discount applied (${payload.discountPercent}%): ${formatCents(payload.previousPriceInCents as number)} → ${formatCents(payload.newPriceInCents as number)}`;
    case 'PRICE_ADJUSTED':
      return `Price manually adjusted: ${formatCents(payload.previousPriceInCents as number)} → ${formatCents(payload.newPriceInCents as number)} (${payload.reason})`;
    default:
      return `Price event: ${type}`;
  }
}

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2)} TL`;
}
