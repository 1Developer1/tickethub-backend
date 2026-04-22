/**
 * Application Entry Point
 *
 * Bu dosya uygulamayı başlatır ve graceful shutdown'ı yönetir.
 *
 * GRACEFUL SHUTDOWN NEDİR?
 * SIGTERM sinyali geldiğinde (Docker stop, deployment, vb.):
 * 1. Yeni istek kabul etmeyi durdur
 * 2. Devam eden istekleri tamamla
 * 3. BullMQ worker'ları durdur
 * 4. DB bağlantılarını kapat
 * 5. Redis bağlantılarını kapat
 * 6. SONRA process'i kapat
 *
 * YAPMASAYDIK NE OLURDU?
 * process.exit(0) → açık DB transaction'lar yarım kalır → veri tutarsızlığı.
 * BullMQ worker yarım kalmış job → retry'da beklenmedik durum.
 * Kullanıcının isteği yanıtsız kalır → "bağlantı koptu" hatası.
 */

import { buildApp } from './app.js';
import { startNotificationWorkers } from './modules/notifications/notifications.worker.js';
import { startTicketWorkers } from './modules/tickets/tickets.worker.js';
import { disconnectDatabase } from './shared/database/prisma-client.js';
import { asyncEventBus } from './shared/events/async-event-bus.js';
import { logger } from './shared/logger/index.js';
import { shutdownQueues } from './shared/queue/bullmq.js';
import { disconnectRedis } from './shared/redis/redis-client.js';

async function main(): Promise<void> {
  const app = await buildApp();

  // Background workers — dinler async event bus'ı
  startTicketWorkers();
  startNotificationWorkers();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown...');

    try {
      // 1. Yeni istek kabul etmeyi durdur, devam edenleri tamamla
      await app.close();
      logger.info('HTTP server closed');

      // 2. BullMQ worker'ları durdur
      await shutdownQueues();

      // 3. Async event bus queue'larını kapat
      await asyncEventBus.closeAll();

      // 4. DB bağlantılarını kapat
      await disconnectDatabase();

      // 5. Redis bağlantılarını kapat
      await disconnectRedis();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  // SIGTERM: Docker stop, Kubernetes pod termination, systemd stop
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // SIGINT: Ctrl+C
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Beklenmeyen hatalar — logla, ama graceful shutdown yap
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  try {
    await app.listen({ port, host });
    logger.info(`🎫 TicketHub API running at http://${host}:${port}`);
    logger.info(`📋 Health check: http://${host}:${port}/health`);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
