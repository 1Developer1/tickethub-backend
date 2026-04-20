/**
 * Notifications Module — BullMQ Workers
 *
 * Bu modül ne yapıyor: Email + SMS bildirim gönderimi (fire-and-forget).
 * Hangi pattern: BullMQ worker + dead letter queue.
 * Neden fire-and-forget: Bildirim başarısız olursa ana akışı BLOKLAMA.
 *   Kullanıcının bileti zaten alındı — email sonra gider.
 *
 * DEAD LETTER QUEUE:
 * 3 denemeden sonra hâlâ başarısız → dead letter queue'ya taşı → admin dashboard'da göster.
 * Neden? Bildirimi sessizce kaybetme — admin'in haberi olsun.
 *
 * RETRY STRATEGY:
 * 1. deneme: hemen
 * 2. deneme: 1 dakika sonra
 * 3. deneme: 5 dakika sonra
 * Hâlâ başarısız → dead letter queue
 *
 * Development'ta MailHog — gerçek email gönderme, http://localhost:8025 ile görüntüle.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/logger/index.js';
import { createWorker, registerWorker } from '../../shared/queue/bullmq.js';

// ── Email Transporter ──
function createMailTransporter(): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const transporter = createMailTransporter();

// ── Email Templates ──
const emailTemplates: Record<
  string,
  (data: Record<string, unknown>) => { subject: string; html: string }
> = {
  BOOKING_CONFIRMED: (data) => ({
    subject: 'Your booking is confirmed! 🎫',
    html: `
      <h1>Booking Confirmed</h1>
      <p>Your reservation <strong>${data.reservationId}</strong> has been confirmed.</p>
      <p>Payment ID: ${data.paymentId}</p>
      <p>Your e-tickets will be emailed shortly.</p>
    `,
  }),
  BOOKING_CANCELLED: (data) => ({
    subject: 'Booking cancelled',
    html: `
      <h1>Booking Cancelled</h1>
      <p>Your reservation <strong>${data.reservationId}</strong> has been cancelled.</p>
      ${data.refundRequired ? '<p>A refund will be processed within 5-10 business days.</p>' : ''}
    `,
  }),
  BOOKING_EXPIRED: (data) => ({
    subject: 'Reservation expired',
    html: `
      <h1>Reservation Expired</h1>
      <p>Your reservation <strong>${data.reservationId}</strong> has expired because payment was not completed within 10 minutes.</p>
      <p>The seats have been released and are available for others.</p>
    `,
  }),
  TICKET_READY: (data) => ({
    subject: 'Your e-ticket is ready! 🎫',
    html: `
      <h1>E-Ticket Ready</h1>
      <p>Your ticket for the event is ready.</p>
      <p>Ticket ID: ${data.ticketId}</p>
      <p>Please present the QR code at the entrance.</p>
    `,
  }),
  EVENT_REMINDER: (data) => ({
    subject: `Reminder: ${data.eventName} is tomorrow!`,
    html: `
      <h1>Event Reminder</h1>
      <p>Don't forget! <strong>${data.eventName}</strong> is happening tomorrow.</p>
      <p>Make sure to have your QR ticket ready.</p>
    `,
  }),
};

interface NotificationJobData {
  type: string;
  recipientId: string;
  recipientEmail: string;
  data: Record<string, unknown>;
}

/**
 * Email notification worker başlat.
 */
export function startNotificationWorkers(): void {
  const emailWorker = createWorker<NotificationJobData>(
    'notification.send',
    async (job) => {
      const { type, recipientId, recipientEmail, data } = job.data;

      // Eğer email adresi yoksa, DB'den çek
      let email = recipientEmail;
      if (!email) {
        const user = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { email: true },
        });
        if (!user) {
          logger.warn({ recipientId }, 'Notification recipient not found, skipping');
          return;
        }
        email = user.email;
      }

      // Template seç
      const templateFn = emailTemplates[type];
      if (!templateFn) {
        logger.warn({ type }, 'Unknown notification type, skipping');
        return;
      }

      const { subject, html } = templateFn(data);

      // Email gönder
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'noreply@tickethub.com',
        to: email,
        subject,
        html,
      });

      // DB'ye kaydet
      await prisma.notification.create({
        data: {
          recipientId,
          channel: 'EMAIL',
          type,
          subject,
          body: html,
          status: 'SENT',
          attempts: job.attemptsMade + 1,
          sentAt: new Date(),
        },
      });

      logger.info({ type, recipientId, email }, 'Notification sent');
    },
    {
      concurrency: 3,
    },
  );

  registerWorker(emailWorker);
  logger.info('Notification email worker started');
}
