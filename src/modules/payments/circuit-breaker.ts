/**
 * Circuit Breaker — Dış Servis Koruma Mekanizması
 *
 * NEDEN CIRCUIT BREAKER?
 * Stripe geçici hata verdi (timeout, 500 error):
 * - Circuit breaker OLMADAN: her kullanıcı isteği Stripe'a gider → 30s timeout bekler
 *   → 1000 kullanıcı aynı anda → 1000 connection açık → sunucu kaynak tüketir → ÇÖKER
 * - Circuit breaker İLE: 5 hata → circuit OPEN → Stripe'a istek GÖNDERİLMEZ
 *   → hemen "servis kullanılamıyor" döner → 30s sonra bir istek gönder (HALF_OPEN)
 *   → başarılıysa circuit kapat, değilse açık bırak
 *
 * DURUM MAKİNESİ:
 * CLOSED (normal) → hata sayısı threshold aştı → OPEN (fail fast)
 * OPEN → cooldown süresi doldu → HALF_OPEN (tek istek dene)
 * HALF_OPEN → başarılı → CLOSED | başarısız → OPEN
 *
 * Neden kütüphane kullanmıyoruz?
 * 60 satır. Pattern'i anlamak kütüphane import etmekten daha değerli.
 */

import { ExternalServiceError } from '../../shared/errors/http-errors.js';
import { logger } from '../../shared/logger/index.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly serviceName: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: {
    serviceName: string;
    failureThreshold?: number; // Kaç hatada açılsın (default: 5)
    cooldownMs?: number; // Ne kadar açık kalsın (default: 30s)
  }) {
    this.serviceName = options.serviceName;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
  }

  /**
   * Korunan fonksiyonu çalıştır.
   * Circuit OPEN ise hemen hata döner (fail fast).
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Cooldown doldu mu?
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.state = 'HALF_OPEN';
        logger.info({ service: this.serviceName }, 'Circuit breaker → HALF_OPEN');
      } else {
        throw new ExternalServiceError(this.serviceName);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info({ service: this.serviceName }, 'Circuit breaker → CLOSED');
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn(
        { service: this.serviceName, failureCount: this.failureCount },
        'Circuit breaker → OPEN',
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  /** Test helper: reset */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
