/**
 * Mock Payment Adapter — Test & Development
 *
 * Her zaman başarılı döner (configurable failure için fail flag var).
 * Development ve test'te gerçek Stripe kullanmak yerine bunu kullan.
 *
 * NEDEN MOCK ADAPTER?
 * - Test'te Stripe'a gerçek istek atma (yavaş, güvenilmez, maliyetli)
 * - Development'ta Stripe hesabı şart değil
 * - Edge case test: "Stripe hata verdi" senaryosunu simüle et
 */

import type { PaymentGateway, PaymentIntent, PaymentResult, RefundResult } from '../ports/payment-gateway.port.js';
import { v4 as uuidv4 } from 'uuid';

export class MockPaymentAdapter implements PaymentGateway {
  private shouldFail: boolean;

  constructor(options?: { shouldFail?: boolean }) {
    this.shouldFail = options?.shouldFail ?? false;
  }

  /** Test'te fail modunu açıp kapa */
  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async createPaymentIntent(
    amountInCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    if (this.shouldFail) {
      return {
        id: `mock_pi_${uuidv4()}`,
        status: 'failed',
        amountInCents,
        currency,
        metadata,
      };
    }

    return {
      id: `mock_pi_${uuidv4()}`,
      status: 'succeeded',
      amountInCents,
      currency,
      metadata,
    };
  }

  async capturePayment(intentId: string): Promise<PaymentResult> {
    if (this.shouldFail) {
      return {
        success: false,
        paymentIntentId: intentId,
        status: 'failed',
        errorMessage: 'Mock payment failure (configured for testing)',
      };
    }

    return {
      success: true,
      paymentIntentId: intentId,
      status: 'succeeded',
    };
  }

  async refund(_paymentIntentId: string, amountInCents?: number): Promise<RefundResult> {
    if (this.shouldFail) {
      return {
        success: false,
        refundId: '',
        amountInCents: amountInCents ?? 0,
        status: 'failed',
        errorMessage: 'Mock refund failure',
      };
    }

    return {
      success: true,
      refundId: `mock_re_${uuidv4()}`,
      amountInCents: amountInCents ?? 0,
      status: 'succeeded',
    };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    // Mock: her zaman geçerli
    return true;
  }
}
