/**
 * BullMQ Queue & Worker Factory
 *
 * NEDEN BULLMQ?
 * Asenkron işler (email gönderimi, reservation expire, pricing recalculate) ana request'i
 * bloklamamalı. BullMQ Redis-based job queue ile:
 * - Delayed jobs: "10 dk sonra şu reservation'ı expire et" (cron'dan daha verimli)
 * - Retry + exponential backoff: başarısız job otomatik tekrar dener
 * - Dead letter queue: N denemeden sonra hâlâ başarısız → admin'e bildir
 * - Priority queues: kritik job'lar önce
 *
 * NEDEN RABBITMQ VEYA KAFKA DEĞİL?
 * - RabbitMQ: Ayrı bir servis kurup yönetmek gerekir. BullMQ zaten var olan Redis'i kullanır.
 *   → Operasyonel karmaşıklık artmaz. TicketHub ölçeğinde BullMQ yeterli.
 * - Kafka: Event streaming platformu. Milyonlarca event/saniye, event replay, multi-consumer.
 *   → TicketHub bu ölçekte DEĞİL. Kafka'nın operational cost'u (ZooKeeper, partition yönetimi)
 *      bu proje için overkill.
 * - BullMQ'nun sınırı: ~10.000 job/saniye. Bunun ötesinde RabbitMQ veya Kafka gerekir.
 *
 * NEDEN CRON JOB DEĞİL (reservation expire için)?
 * Cron: Her dakika TÜM reservation'ları tarar → "WHERE status = PENDING AND expiresAt < NOW()"
 *   → 100.000 reservation varsa her dakika full table scan = verimsiz
 * BullMQ delayed job: Tam zamanında, TEK bir reservation için çalışır → O(1)
 */

import { type Job, Queue, Worker, type WorkerOptions } from 'bullmq';
import { logger } from '../logger/index.js';
import { bullmqRedis } from '../redis/redis-client.js';

const defaultQueueOptions = {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s → 2s → 4s
    },
    removeOnComplete: {
      count: 1000, // Son 1000 başarılı job'u tut (debug için)
    },
    removeOnFail: {
      count: 5000, // Son 5000 başarısız job'u tut (dead letter analizi)
    },
  },
};

/**
 * Yeni queue oluştur.
 * Her modül kendi queue'sunu oluşturur (örn: 'reservation-expire', 'notification-email').
 */
export function createQueue(name: string): Queue {
  const queue = new Queue(name, defaultQueueOptions);

  queue.on('error', (err) => {
    logger.error({ err, queue: name }, 'Queue error');
  });

  return queue;
}

/**
 * Queue worker oluştur. Job'ları işleyen process.
 *
 * @param name - Queue adı (hangi queue'yu dinleyecek)
 * @param processor - Job işleme fonksiyonu
 * @param options - Worker ayarları (concurrency vb.)
 *
 * @example
 * const worker = createWorker<{ reservationId: string }>(
 *   'reservation-expire',
 *   async (job) => {
 *     const { reservationId } = job.data;
 *     await bookingService.expireReservation(reservationId);
 *   },
 *   { concurrency: 5 }
 * );
 */
export function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: Partial<WorkerOptions>,
): Worker<T> {
  const worker = new Worker<T>(
    name,
    async (job) => {
      const jobLogger = logger.child({ queue: name, jobId: job.id, jobName: job.name });
      jobLogger.info('Job started');

      try {
        await processor(job);
        jobLogger.info('Job completed');
      } catch (error) {
        jobLogger.error({ err: error, attempt: job.attemptsMade }, 'Job failed');
        throw error; // BullMQ retry mekanizmasının çalışması için error'u fırlat
      }
    },
    {
      connection: bullmqRedis,
      concurrency: 5,
      ...options,
    },
  );

  worker.on('error', (err) => {
    logger.error({ err, worker: name }, 'Worker error');
  });

  // Dead letter queue: Tüm denemeler tükendi → logla
  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      logger.error(
        { jobId: job.id, queue: name, err, data: job.data },
        'Job moved to dead letter queue (all retries exhausted)',
      );
    }
  });

  return worker;
}

/** Tüm queue ve worker'ları graceful shutdown */
const activeWorkers: Worker[] = [];

export function registerWorker(worker: Worker): void {
  activeWorkers.push(worker);
}

export async function shutdownQueues(): Promise<void> {
  await Promise.all(activeWorkers.map((w) => w.close()));
  logger.info('All BullMQ workers shut down');
}
