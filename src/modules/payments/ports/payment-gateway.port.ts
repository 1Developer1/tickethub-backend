/**
 * Payment Gateway Port — Adapter Pattern Interface
 *
 * NEDEN ADAPTER PATTERN?
 * Yarın Stripe'dan iyzico'ya geçersek sadece ADAPTER değişir.
 * Service kodu, domain kodu, route kodu — HİÇBİRİ DEĞİŞMEZ.
 *
 * Bu interface bir "sözleşme" — her payment provider bu sözleşmeyi implement eder.
 *
 * NEDEN SADECE BU MODÜLDE ADAPTER?
 * Adapter pattern dış servis entegrasyonu olan modüllerde değer katar.
 * Users modülünde adapter yok çünkü argon2 bir dış servis DEĞİL, bir kütüphane.
 * Events modülünde adapter yok çünkü PostgreSQL değişmeyecek.
 * Payments'ta: Stripe → iyzico → PayPal geçişi gerçekçi bir senaryo.
 *
 * ❌ ANTI-PATTERN: Her modülde adapter pattern
 * ```
 * // UserRepositoryPort, UserRepositoryAdapter, EventRepositoryPort...
 * // 50 interface, 50 adapter sınıfı, 0 fayda
 * // Prisma zaten bir abstraction — üzerine bir tane daha eklemek gereksiz katman
 * ```
 */

export interface PaymentIntent {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  amountInCents: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId: string;
  status: 'succeeded' | 'failed';
  errorMessage?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amountInCents: number;
  status: 'succeeded' | 'failed';
  errorMessage?: string;
}

export interface PaymentGateway {
  /** Ödeme intent'i oluştur (kullanıcı henüz ödeme yapmadı) */
  createPaymentIntent(
    amountInCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent>;

  /** Ödemeyi yakala (kullanıcı onay verdi) */
  capturePayment(paymentIntentId: string): Promise<PaymentResult>;

  /** İade */
  refund(paymentIntentId: string, amountInCents?: number): Promise<RefundResult>;

  /** Webhook doğrulama (sahte webhook engelleme) */
  verifyWebhookSignature(payload: string, signature: string): boolean;
}
