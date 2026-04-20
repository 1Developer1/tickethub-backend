/**
 * Stripe Payment Adapter
 *
 * PaymentGateway interface'ini Stripe SDK ile implement eder.
 * Production'da kullanılır.
 */

import Stripe from 'stripe';
import type { PaymentGateway, PaymentIntent, PaymentResult, RefundResult } from '../ports/payment-gateway.port.js';
import { logger } from '../../../shared/logger/index.js';

export class StripeAdapter implements PaymentGateway {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion,
    });
    this.webhookSecret = webhookSecret;
  }

  async createPaymentIntent(
    amountInCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata,
      // Otomatik yakalama (capture_method: 'automatic')
      // veya iki aşamalı: 'manual' (önce authorize, sonra capture)
      capture_method: 'automatic',
    });

    logger.info({ paymentIntentId: intent.id, amount: amountInCents }, 'Stripe PaymentIntent created');

    return {
      id: intent.id,
      status: intent.status === 'succeeded' ? 'succeeded' : 'pending',
      amountInCents,
      currency,
      metadata,
    };
  }

  async capturePayment(paymentIntentId: string): Promise<PaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        success: intent.status === 'succeeded',
        paymentIntentId: intent.id,
        status: intent.status === 'succeeded' ? 'succeeded' : 'failed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Stripe error';
      return {
        success: false,
        paymentIntentId,
        status: 'failed',
        errorMessage: message,
      };
    }
  }

  async refund(paymentIntentId: string, amountInCents?: number): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        ...(amountInCents ? { amount: amountInCents } : {}),
      });

      logger.info({ refundId: refund.id, paymentIntentId }, 'Stripe refund created');

      return {
        success: refund.status === 'succeeded',
        refundId: refund.id,
        amountInCents: refund.amount,
        status: refund.status === 'succeeded' ? 'succeeded' : 'failed',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Stripe error';
      return {
        success: false,
        refundId: '',
        amountInCents: amountInCents ?? 0,
        status: 'failed',
        errorMessage: message,
      };
    }
  }

  /**
   * Webhook signature doğrulama.
   * Stripe webhook'unun gerçekten Stripe'dan geldiğini doğrula.
   * Yapmasaydık: herkes /webhooks/stripe'a POST yapıp sahte ödeme onayı gönderebilir.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }
}
