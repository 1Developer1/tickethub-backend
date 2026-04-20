/**
 * Reservation Entity — Domain Model (Projenin Kalbi)
 *
 * NEDEN BU MODÜLDE DOMAIN MODEL VAR?
 * Kurallar birbirine bağımlı ve bypass edilirse:
 * - Para kaybı: aynı koltuk iki kişiye satılır
 * - Müşteri kaybı: iptal edilemeyen bilet
 * - Hukuki sorun: yanlış ödeme iadesi
 *
 * Domain model ile kurallar entity İÇİNDE — dışarıdan bypass EDİLEMEZ.
 * Entity metodu çağırmadan status DEĞİŞTİRİLEMEZ.
 *
 * DURUM GEÇİŞLERİ:
 * PENDING → CONFIRMED (ödeme yapıldı)
 * PENDING → EXPIRED (10 dk doldu, ödeme yapılmadı)
 * PENDING → CANCELLED (kullanıcı vazgeçti)
 * CONFIRMED → CANCELLED (iade — etkinliğe 48+ saat kuralı)
 *
 * GEÇERSİZ GEÇİŞLER (exception fırlatır):
 * EXPIRED → CONFIRMED ❌ (süresi dolmuş reservation onaylanamaz)
 * CANCELLED → CONFIRMED ❌ (iptal edilmiş reservation onaylanamaz)
 * CONFIRMED → EXPIRED ❌ (onaylanmış reservation expire olmaz)
 *
 * ❌ ANTI-PATTERN: Domain model olmadan düz service'te yazmak
 * ```
 * // bookingService.confirm(id) — kurallar service'te dağınık
 * async function confirm(id: string) {
 *   const reservation = await db.reservation.findUnique({ where: { id } });
 *   if (reservation.status === 'PENDING') {
 *     await db.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
 *   }
 * }
 *
 * // SORUN: Başka bir geliştirici kuralı atlar:
 * await db.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
 * // ↑ Status kontrolü YOK, expiry kontrolü YOK, version kontrolü YOK
 * // Expired reservation onaylanabilir, aynı koltuk iki kişiye satılabilir
 * ```
 *
 * ✅ DOĞRU: Domain model ile
 * ```
 * reservation.confirmPayment(paymentId);
 * // ↑ İçinde: status === PENDING mi? Hold süresi dolmamış mı? Version doğru mu?
 * // Kural ihlali → exception. Bypass EDİLEMEZ.
 * ```
 */

import { SeatHold } from './seat-hold.value-object.js';
import { Money } from './money.value-object.js';
import type { ReservationDomainEvent } from './reservation.events.js';
import { CANCELLATION_DEADLINE_HOURS } from '../../../config/constants.js';

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface ReservationProps {
  id: string;
  userId: string;
  eventId: string;
  status: ReservationStatus;
  seatHolds: SeatHold[];
  totalPrice: Money;
  version: number;
  expiresAt: Date;
  eventStartsAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  paymentId?: string;
  createdAt: Date;
}

export class Reservation {
  private _domainEvents: ReservationDomainEvent[] = [];

  private constructor(private props: ReservationProps) {}

  // ── Factory Methods ──

  /**
   * Yeni reservation oluştur (PENDING status).
   */
  static create(params: {
    id: string;
    userId: string;
    eventId: string;
    seatHolds: SeatHold[];
    totalPrice: Money;
    expiresAt: Date;
    eventStartsAt: Date;
  }): Reservation {
    const reservation = new Reservation({
      ...params,
      status: 'PENDING',
      version: 1,
      createdAt: new Date(),
    });

    // Domain event üret
    reservation._domainEvents.push({
      type: 'reservation.created',
      reservationId: params.id,
      userId: params.userId,
      eventId: params.eventId,
      seats: params.seatHolds.map((sh) => ({
        section: sh.sectionName,
        row: sh.row,
        seat: sh.seat,
      })),
      totalPriceInCents: params.totalPrice.amountInCents,
    });

    return reservation;
  }

  /**
   * DB'den yükle (mevcut reservation).
   */
  static fromPersistence(props: ReservationProps): Reservation {
    return new Reservation(props);
  }

  // ── Getters (private field'lar dışarıdan DEĞİŞTİRİLEMEZ) ──

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get eventId(): string { return this.props.eventId; }
  get status(): ReservationStatus { return this.props.status; }
  get seatHolds(): ReadonlyArray<SeatHold> { return this.props.seatHolds; }
  get totalPrice(): Money { return this.props.totalPrice; }
  get version(): number { return this.props.version; }
  get expiresAt(): Date { return this.props.expiresAt; }
  get confirmedAt(): Date | undefined { return this.props.confirmedAt; }
  get cancelledAt(): Date | undefined { return this.props.cancelledAt; }
  get paymentId(): string | undefined { return this.props.paymentId; }
  get createdAt(): Date { return this.props.createdAt; }

  /** Üretilen domain event'leri al ve temizle */
  pullDomainEvents(): ReservationDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  // ── Command Methods (durum değiştiren işlemler) ──

  /**
   * Ödeme onayı — PENDING → CONFIRMED
   *
   * Kurallar:
   * 1. Status PENDING olmalı
   * 2. Hold süresi dolmamış olmalı
   * 3. PaymentId sağlanmalı
   */
  confirmPayment(paymentId: string): void {
    // Invariant: sadece PENDING reservation onaylanabilir
    if (this.props.status !== 'PENDING') {
      throw new Error(
        `Cannot confirm reservation in '${this.props.status}' status. Only PENDING reservations can be confirmed.`,
      );
    }

    // Invariant: hold süresi dolmamış olmalı
    if (this.isHoldExpired()) {
      throw new Error(
        'Cannot confirm reservation: hold has expired. The seats have been released.',
      );
    }

    // Durum geçişi
    this.props.status = 'CONFIRMED';
    this.props.confirmedAt = new Date();
    this.props.paymentId = paymentId;
    this.props.version += 1;

    // Domain event
    this._domainEvents.push({
      type: 'reservation.confirmed',
      reservationId: this.props.id,
      userId: this.props.userId,
      eventId: this.props.eventId,
      paymentId,
    });
  }

  /**
   * Hold süresi doldu — PENDING → EXPIRED
   *
   * BullMQ delayed job tarafından çağrılır (10 dk sonra).
   * Kurallar:
   * 1. Status PENDING olmalı (zaten onaylanmışsa expire etme)
   * 2. Hold süresi gerçekten dolmuş olmalı
   */
  expire(): void {
    // Sadece PENDING reservation expire olabilir
    if (this.props.status !== 'PENDING') {
      return; // Sessizce geri dön — race condition'da confirm + expire aynı anda çalışabilir
    }

    this.props.status = 'EXPIRED';
    this.props.version += 1;

    this._domainEvents.push({
      type: 'reservation.expired',
      reservationId: this.props.id,
      eventId: this.props.eventId,
      seats: this.props.seatHolds.map((sh) => ({
        section: sh.sectionName,
        row: sh.row,
        seat: sh.seat,
      })),
    });
  }

  /**
   * İptal — PENDING → CANCELLED veya CONFIRMED → CANCELLED
   *
   * Kurallar:
   * 1. EXPIRED veya zaten CANCELLED ise iptal edilemez
   * 2. CONFIRMED ise: etkinliğe 48+ saat kural kontrolü
   * 3. CONFIRMED ise: ödeme iadesi gerekli (refundRequired flag)
   */
  cancel(): void {
    if (this.props.status === 'EXPIRED') {
      throw new Error('Cannot cancel an expired reservation');
    }
    if (this.props.status === 'CANCELLED') {
      throw new Error('Reservation is already cancelled');
    }

    const refundRequired = this.props.status === 'CONFIRMED';

    // CONFIRMED ise: etkinliğe 48+ saat kuralı
    if (this.props.status === 'CONFIRMED') {
      const hoursUntilEvent = this.hoursUntilEvent();
      if (hoursUntilEvent < CANCELLATION_DEADLINE_HOURS) {
        throw new Error(
          `Cannot cancel: event starts in ${hoursUntilEvent.toFixed(0)} hours. ` +
          `Cancellation deadline is ${CANCELLATION_DEADLINE_HOURS} hours before event.`,
        );
      }
    }

    this.props.status = 'CANCELLED';
    this.props.cancelledAt = new Date();
    this.props.version += 1;

    this._domainEvents.push({
      type: 'reservation.cancelled',
      reservationId: this.props.id,
      userId: this.props.userId,
      eventId: this.props.eventId,
      refundRequired,
    });
  }

  // ── Query Methods (durumu sorgulayan işlemler) ──

  isHoldExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  isPending(): boolean {
    return this.props.status === 'PENDING';
  }

  isConfirmed(): boolean {
    return this.props.status === 'CONFIRMED';
  }

  private hoursUntilEvent(): number {
    const now = new Date();
    return (this.props.eventStartsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  }

  // ── Persistence ──

  toPersistence() {
    return {
      id: this.props.id,
      userId: this.props.userId,
      eventId: this.props.eventId,
      status: this.props.status,
      totalPriceInCents: this.props.totalPrice.amountInCents,
      version: this.props.version,
      expiresAt: this.props.expiresAt,
      confirmedAt: this.props.confirmedAt ?? null,
      cancelledAt: this.props.cancelledAt ?? null,
    };
  }
}
