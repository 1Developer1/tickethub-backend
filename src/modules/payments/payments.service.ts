/**
 * Payments Service — Gateway + Circuit Breaker + Idempotency
 *
 * Bu modül ne yapıyor: Ödeme alma, iade, webhook işleme.
 * Hangi pattern: Adapter (port/adapter), circuit breaker.
 * Neden adapter: Stripe → iyzico geçişinde sadece adapter değişir.
 *
 * İDEMPOTENCY (middleware katmanında):
 * Aynı Idempotency-Key ile iki istek gelirse → ikincisi cached response döner.
 * Neden? Ağ hatası → kullanıcı tekrar tıklar → çift ödeme → felaket.
 *
 * ❌ ANTI-PATTERN: Idempotency key olmadan ödeme almak
 * ```
 * // Kullanıcı "Ödeme Yap" tıkladı → timeout → tekrar tıkladı
 * // İlk istek aslında başarılıydı → ama timeout nedeniyle kullanıcı bilmiyor
 * // İkinci istek: ikinci ödeme alındı → kullanıcı çift ücret ödedi
 * ```
 */

import type { PaymentGateway, PaymentResult, RefundResult } from './ports/payment-gateway.port.js';
import { StripeAdapter } from './adapters/stripe.adapter.js';
import { MockPaymentAdapter } from './adapters/mock-payment.adapter.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { PaymentError } from '../../shared/errors/http-errors.js';
import { logger } from '../../shared/logger/index.js';

// Gateway seçimi: environment'a göre
function createGateway(): PaymentGateway {
  if (process.env.NODE_ENV === 'production') {
    return new StripeAdapter(
      process.env.STRIPE_SECRET_KEY!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  }
  // Development ve test'te mock kullan
  return new MockPaymentAdapter();
}

const gateway = createGateway();
const circuitBreaker = new CircuitBreaker({
  serviceName: 'payment-gateway',
  failureThreshold: 5,
  cooldownMs: 30_000,
});

export const paymentsService = {
  /**
   * Ödeme al.
   * Circuit breaker ile korunuyor — gateway down ise hemen hata döner.
   */
  async charge(params: {
    reservationId: string;
    amountInCents: number;
    currency: string;
    idempotencyKey?: string;
  }): Promise<PaymentResult> {
    // Circuit breaker ile gateway çağrısı
    const intent = await circuitBreaker.execute(() =>
      gateway.createPaymentIntent(params.amountInCents, params.currency, {
        reservationId: params.reservationId,
      }),
    );

    // DB'ye kaydet
    await prisma.payment.create({
      data: {
        reservationId: params.reservationId,
        externalId: intent.id,
        amountInCents: params.amountInCents,
        currency: params.currency,
        status: intent.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
        idempotencyKey: params.idempotencyKey,
      },
    });

    if (intent.status !== 'succeeded') {
      throw new PaymentError('Payment was not successful', {
        paymentIntentId: intent.id,
      });
    }

    logger.info(
      { reservationId: params.reservationId, paymentIntentId: intent.id },
      'Payment charged successfully',
    );

    return {
      success: true,
      paymentIntentId: intent.id,
      status: 'succeeded',
    };
  },

  /**
   * İade.
   */
  async refund(params: {
    reservationId: string;
    amountInCents?: number;
  }): Promise<RefundResult> {
    const payment = await prisma.payment.findUnique({
      where: { reservationId: params.reservationId },
    });

    if (!payment?.externalId) {
      throw new PaymentError('No payment found for this reservation');
    }

    const result = await circuitBreaker.execute(() =>
      gateway.refund(payment.externalId!, params.amountInCents),
    );

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: params.amountInCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
          refundedAmountInCents: { increment: result.amountInCents },
        },
      });
    }

    logger.info(
      { reservationId: params.reservationId, refundId: result.refundId },
      'Payment refund processed',
    );

    return result;
  },

  /**
   * Webhook handler — Stripe'dan gelen ödeme durumu bildirimi.
   */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    if (!gateway.verifyWebhookSignature(payload, signature)) {
      throw new PaymentError('Invalid webhook signature');
    }

    // Parse webhook event
    const event = JSON.parse(payload) as { type: string; data: { object: { id: string; status: string; metadata: { reservationId?: string } } } };

    logger.info({ webhookType: event.type }, 'Payment webhook received');

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntentId = event.data.object.id;
      await prisma.payment.updateMany({
        where: { externalId: paymentIntentId },
        data: { status: 'SUCCEEDED' },
      });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntentId = event.data.object.id;
      await prisma.payment.updateMany({
        where: { externalId: paymentIntentId },
        data: { status: 'FAILED' },
      });
    }
  },
};
