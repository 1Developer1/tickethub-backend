/**
 * Synchronous In-Process Event Bus
 *
 * NEDEN SYNC EVENT BUS?
 * Bazı event'ler ANINDA işlenmeli ve başarısız olursa tüm işlem GERİ ALINMALI.
 * Örnek: Koltuk hold → stok kontrolü başarısız → reservation oluşmamalı.
 *
 * Bu bir in-memory event bus — aynı process içinde, aynı transaction'da çalışır.
 * Microservice'e geçilirse bu, module-internal event bus olarak kalır.
 *
 * YAPMASAYDIK NE OLURDU?
 * Modüller birbirinin service'ini doğrudan çağırırdı → tight coupling.
 * Booking → Pricing.recalculate() → Notification.send() → ...
 * Event bus ile: Booking "reservation.confirmed" yayınlar, ilgilenen modüller dinler.
 * Yeni bir listener eklemek = mevcut kodu DEĞİŞTİRMEDEN yeni handler kaydet.
 */

import { logger } from '../logger/index.js';
import type { EventHandler, EventMap } from './types.js';

type HandlerMap = {
  [K in keyof EventMap]?: EventHandler<K>[];
};

class SyncEventBus {
  private handlers: HandlerMap = {};

  /**
   * Event handler kaydet.
   * Aynı event tipine birden fazla handler kaydedilebilir (hepsi sırayla çalışır).
   */
  on<T extends keyof EventMap>(event: T, handler: EventHandler<T>): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event]?.push(handler);
    logger.debug({ event }, 'Sync event handler registered');
  }

  /**
   * Event yayınla. Tüm handler'lar SIRAYLA çalışır (await ile).
   * Herhangi biri hata fırlatırsa, hata yukarı propagate olur → transaction rollback.
   */
  async emit<T extends keyof EventMap>(event: T, payload: EventMap[T]): Promise<void> {
    const handlers = this.handlers[event] as EventHandler<T>[] | undefined;
    if (!handlers || handlers.length === 0) {
      logger.debug({ event }, 'No sync handlers for event');
      return;
    }

    logger.debug({ event, handlerCount: handlers.length }, 'Emitting sync event');

    for (const handler of handlers) {
      await handler(payload);
    }
  }

  /** Handler'ları temizle (test isolation için) */
  clear(): void {
    this.handlers = {};
  }
}

// Singleton
export const syncEventBus = new SyncEventBus();
