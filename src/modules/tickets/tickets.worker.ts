/**
 * Tickets Module — Worker
 *
 * `reservation.confirmed` event'ini dinler ve her seat için QR-imzalı bilet üretir.
 * Üretim sonrası `ticket.generated` event'i + `notification.send` event'i atar.
 */

import { logger } from '../../shared/logger/index.js';
import { createWorker, registerWorker } from '../../shared/queue/bullmq.js';
import { ticketsService } from './tickets.service.js';

interface ReservationConfirmedJob {
  reservationId: string;
  userId: string;
  eventId: string;
  paymentId: string;
}

export function startTicketWorkers(): void {
  const worker = createWorker<ReservationConfirmedJob>(
    'reservation.confirmed',
    async (job) => {
      const { reservationId } = job.data;
      await ticketsService.generateTickets(reservationId);
      logger.info({ reservationId }, 'Tickets generated for confirmed reservation');
    },
    { concurrency: 5 },
  );

  registerWorker(worker);
  logger.info('Ticket worker started (listens reservation.confirmed)');
}
