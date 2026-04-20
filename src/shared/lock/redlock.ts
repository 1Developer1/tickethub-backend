/**
 * Distributed Lock — Redlock Algorithm
 *
 * NEDEN DISTRIBUTED LOCK?
 * Aynı koltuğa aynı anda 500 kişi tıklıyor. DB transaction tek başına YETMEZ çünkü:
 * - Birden fazla server instance var (horizontal scaling)
 * - Her instance kendi transaction'ını açar
 * - İki instance aynı anda "koltuk müsait" görür → ikisi de yazar → AYNI KOLTUK İKİ KİŞİYE SATILIR
 *
 * Distributed lock ile:
 * - İlk gelen lock'ı alır → "bu koltuğu ben kontrol ediyorum"
 * - İkinci gelen lock'ı alamaz → "bu koltuk başka biri tarafından seçiliyor" hatası alır
 * - Lock'ı alan kişi işini bitirdiğinde veya TTL dolduğunda lock serbest kalır
 *
 * LOCK OLMADAN NE OLUR? (Anti-pattern)
 * ```
 * // ❌ YANLIŞ: Lock'sız koltuk kontrolü
 * const seat = await db.seatHold.findFirst({ where: { seatId, status: 'AVAILABLE' } });
 * if (seat) {
 *   await db.seatHold.create({ data: { seatId, userId } });
 *   // ↑ İki request aynı anda buraya gelir → ikisi de seat'i AVAILABLE görür
 *   // → ikisi de create yapar → AYNI KOLTUK İKİ KİŞİYE SATILDI 💀
 * }
 * ```
 */

// @ts-expect-error — redlock ESM exports issue with NodeNext resolution
import Redlock from 'redlock';
import { redis } from '../redis/redis-client.js';
import { logger } from '../logger/index.js';
import { SeatUnavailableError } from '../errors/http-errors.js';

export const redlock = new Redlock([redis], {
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 100,
  driftFactor: 0.01,
});

redlock.on('error', (error: Error) => {
  logger.error({ err: error }, 'Redlock error');
});

/**
 * Koltuk lock'ı al.
 * Lock alınamazsa SeatUnavailableError fırlatır (başka biri koltuğu seçiyor).
 */
export async function acquireSeatLock(
  eventId: string,
  seatKey: string,
  ttlMs = 30_000,
): Promise<{ release: () => Promise<void> }> {
  const resource = `lock:seat:${eventId}:${seatKey}`;

  try {
    const lock = await redlock.acquire([resource], ttlMs);
    logger.debug({ resource, ttlMs }, 'Seat lock acquired');
    return lock;
  } catch {
    throw new SeatUnavailableError(
      `${seatKey} (another user is selecting this seat)`,
    );
  }
}

/**
 * Genel amaçlı distributed lock.
 */
export async function acquireLock(
  resource: string,
  ttlMs: number,
): Promise<{ release: () => Promise<void> }> {
  return redlock.acquire([`lock:${resource}`], ttlMs);
}
