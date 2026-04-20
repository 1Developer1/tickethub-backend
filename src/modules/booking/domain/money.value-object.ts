/**
 * Money Value Object — Immutable, Integer Cents
 *
 * NEDEN VALUE OBJECT?
 * Para miktarı bir "değer" — kimliği yok, eşitlik içeriğe göre.
 * 100 TL === 100 TL (aynı miktar, aynı para birimi = eşit).
 *
 * NEDEN IMMUTABLE?
 * Para üzerinde işlem yapınca yeni Money döner, eski değişmez.
 * Mutable olsaydı: reservation.totalPrice'ı hesaplarken, başka bir yerde
 * aynı Money objesini kullanan kod etkilenirdi (shared state bug).
 *
 * NEDEN INTEGER CENTS?
 * ```
 * // ❌ FLOAT İLE PARA HESAPLAMA — ANTI-PATTERN
 * const price = 0.1 + 0.2; // 0.30000000000000004 (JavaScript IEEE 754)
 * const total = 19.99 * 3;  // 59.97000000000001
 * // Fatura: 59.97 TL | Hesaplama: 59.97000000000001 TL → UYUŞMAZLIK
 * // Milyonlarca işlemde kuruş farkları BİRİKİR → muhasebe hatası
 * ```
 *
 * ```
 * // ✅ INTEGER CENTS İLE PARA HESAPLAMA
 * const price = Money.fromCents(1999); // 19.99 TL
 * const total = price.multiply(3);      // 5997 cents = 59.97 TL (TAM DOĞRU)
 * // Gösterim: total.toDisplayString() → "59.97 TL"
 * ```
 */

export class Money {
  private constructor(
    private readonly _amountInCents: number,
    private readonly _currency: string = 'TRY',
  ) {
    // Invariant: amount negatif olamaz
    if (_amountInCents < 0) {
      throw new Error(`Money amount cannot be negative: ${_amountInCents}`);
    }
    // Invariant: tam sayı olmalı (cent = en küçük birim)
    if (!Number.isInteger(_amountInCents)) {
      throw new Error(`Money amount must be an integer (cents): ${_amountInCents}`);
    }
  }

  // ── Factory Methods ──

  static fromCents(amountInCents: number, currency = 'TRY'): Money {
    return new Money(amountInCents, currency);
  }

  static zero(currency = 'TRY'): Money {
    return new Money(0, currency);
  }

  // ── Getters ──

  get amountInCents(): number {
    return this._amountInCents;
  }

  get currency(): string {
    return this._currency;
  }

  // ── Arithmetic (her işlem YENİ Money döner — immutable) ──

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._amountInCents + other._amountInCents, this._currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this._amountInCents - other._amountInCents;
    if (result < 0) {
      throw new Error(
        `Cannot subtract ${other._amountInCents} from ${this._amountInCents}: result would be negative`,
      );
    }
    return new Money(result, this._currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this._amountInCents * factor), this._currency);
  }

  // ── Comparison ──

  equals(other: Money): boolean {
    return this._amountInCents === other._amountInCents && this._currency === other._currency;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amountInCents > other._amountInCents;
  }

  isZero(): boolean {
    return this._amountInCents === 0;
  }

  // ── Display ──

  toDisplayString(): string {
    const amount = (this._amountInCents / 100).toFixed(2);
    return `${amount} ${this._currency}`;
  }

  toJSON(): { amountInCents: number; currency: string } {
    return { amountInCents: this._amountInCents, currency: this._currency };
  }

  // ── Private ──

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Cannot operate on different currencies: ${this._currency} vs ${other._currency}`,
      );
    }
  }
}
