/**
 * Prisma Client Singleton
 *
 * NEDEN SINGLETON?
 * Prisma her PrismaClient instance'ı için bir connection pool açar.
 * Birden fazla instance → birden fazla pool → DB bağlantı limiti hızla tükenir.
 * Prisma kendi dökümanlarında "tek instance kullanın" der.
 *
 * NEDEN PRISMA?
 * - Type-safe sorgular: DB şeması değiştiğinde TypeScript compile hatası verir
 * - Auto-generated types: Prisma schema'dan TypeScript tipleri otomatik üretilir
 * - Migration sistemi: schema değişikliklerini versiyonla, rollback yap
 * - Alternatifler:
 *   - TypeORM: decorator-based, runtime reflection → daha yavaş, hata yakalamak zor
 *   - Sequelize: JavaScript-first, TypeScript desteği sonradan eklendi → tip güvenliği zayıf
 *   - Drizzle: SQL-first, daha performanslı raw query → ama migration sistemi daha az olgun
 *   - Prisma ne zaman yanlış seçim? Çok karmaşık raw SQL gerekiyorsa (analytics, reporting)
 *     → Drizzle veya raw SQL daha iyi
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../logger/index.js';

const isDevOrTest = process.env.NODE_ENV !== 'production';

// Global'de cache'le — hot reload'da (tsx watch) yeni instance oluşmasını önle
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDevOrTest
      ? [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ]
      : [{ level: 'error', emit: 'stdout' }],
  });

// Development'ta query log'larını Pino ile yaz
if (isDevOrTest) {
  // @ts-expect-error — Prisma event typing is incomplete
  prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
    logger.debug({ query: e.query, params: e.params, duration: `${e.duration}ms` }, 'Prisma query');
  });
}

// Hot reload guard
if (isDevOrTest) {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful disconnect — uygulama kapanırken açık bağlantıları kapat.
 * Yapmasaydık: connection pool'da orphan bağlantılar kalır → DB bağlantı limiti tükenir.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
