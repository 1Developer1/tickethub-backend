/**
 * Transaction Helper — Prisma Interactive Transaction Wrapper
 *
 * NEDEN TRANSACTION HELPER?
 * Optimistic concurrency kullanıyoruz → "version mismatch" hatası beklenen bir durum.
 * Prisma bu durumda P2034 hatası fırlatır. Bu helper otomatik retry yapar.
 *
 * YAPMASAYDIK NE OLURDU?
 * Her service'te try-catch + retry loop + P2034 kontrol → tekrar eden boilerplate.
 * Bir geliştirici retry yazmayı unutuyor → kullanıcı "bilinmeyen hata" görüyor
 * oysa sadece tekrar denemek yeterliydi.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from './prisma-client.js';
import { logger } from '../logger/index.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

type TransactionFn<T> = (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>;

/**
 * Interactive transaction with automatic retry for serialization failures.
 *
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const reservation = await tx.reservation.findUniqueOrThrow({ where: { id } });
 *   // ... business logic ...
 *   return await tx.reservation.update({ where: { id }, data: { ... } });
 * });
 */
export async function withTransaction<T>(
  fn: TransactionFn<T>,
  options?: {
    maxRetries?: number;
    timeout?: number;
    isolationLevel?: 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout: options?.timeout ?? 10_000,
        isolationLevel: options?.isolationLevel,
      });
    } catch (error) {
      const isSerializationFailure =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2034';

      if (isSerializationFailure && attempt < maxRetries) {
        logger.warn(
          { attempt, maxRetries },
          'Transaction serialization failure, retrying...',
        );
        await delay(RETRY_DELAY_MS * attempt); // Linear backoff
        continue;
      }

      throw error;
    }
  }

  // TypeScript reachability — never actually gets here
  throw new Error('Transaction retry exhausted');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
