/**
 * Asynchronous Event Bus — BullMQ Wrapper
 *
 * NEDEN ASYNC EVENT BUS?
 * Uzun süren işleri (email, QR üretimi, pricing recalculate) kullanıcı beklemeden
 * arka planda çalıştır. BullMQ ile:
 * - Retry: başarısız olursa otomatik tekrar
 * - Delay: "10 dk sonra çalıştır" (reservation expire)
 * - Persistence: Redis'te saklanır, process crash'te kaybolmaz
 *
 * SYNC vs ASYNC SEÇİMİ:
 * - İşlem başarısız olursa ana akış etkilenmeli mi? → SYNC (stok kontrolü)
 * - İşlem uzun sürüyor, kullanıcıyı bekletme? → ASYNC (email gönderimi)
 * - İşlem başarısız olursa retry yeterli mi? → ASYNC (QR üretimi)
 */

import type { Queue } from 'bullmq';
import { createQueue } from '../queue/bullmq.js';
import type { EventMap } from './types.js';
import { logger } from '../logger/index.js';

// Her event tipi için bir BullMQ queue
const queues = new Map<string, Queue>();

function getOrCreateQueue(name: string): Queue {
  if (!queues.has(name)) {
    queues.set(name, createQueue(name));
  }
  return queues.get(name) as Queue;
}

export const asyncEventBus = {
  /**
   * Async event yayınla — BullMQ job olarak queue'ya ekle.
   * Hemen döner, job arka planda worker tarafından işlenir.
   *
   * @param event - Event tipi (queue adı olarak da kullanılır)
   * @param payload - Event verisi
   * @param options - BullMQ job options (delay, priority, vb.)
   */
  async emit<T extends keyof EventMap>(
    event: T,
    payload: EventMap[T],
    options?: {
      /** Gecikme (ms). Örn: 600_000 = 10 dk sonra çalıştır */
      delay?: number;
      /** Öncelik (düşük sayı = yüksek öncelik) */
      priority?: number;
      /** Benzersiz job ID (duplicate önleme) */
      jobId?: string;
    },
  ): Promise<void> {
    const queue = getOrCreateQueue(event as string);

    await queue.add(event as string, payload as Record<string, unknown>, {
      delay: options?.delay,
      priority: options?.priority,
      jobId: options?.jobId,
    });

    logger.debug({ event, delay: options?.delay }, 'Async event emitted');
  },

  /**
   * Queue referansı al — worker oluşturmak için.
   * Worker'lar modüllerin kendi içinde oluşturulur.
   */
  getQueue(event: keyof EventMap): Queue {
    return getOrCreateQueue(event as string);
  },

  /** Tüm queue'ları kapat (graceful shutdown) */
  async closeAll(): Promise<void> {
    await Promise.all(Array.from(queues.values()).map((q) => q.close()));
    queues.clear();
  },
};
