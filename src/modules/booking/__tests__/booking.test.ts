/**
 * Booking Module — Unit Tests
 *
 * En değerli testler: domain entity mantığı — DB yok, dış servis yok, hızlı, güvenilir.
 * Reservation entity'nin durum geçişlerini, invariant kontrollerini, edge case'leri test et.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '../domain/money.value-object.js';
import { Reservation } from '../domain/reservation.entity.js';
import { SeatHold } from '../domain/seat-hold.value-object.js';

// ── Test Helpers ──

function createTestSeatHold(
  overrides?: Partial<{ sectionName: string; row: number; seat: number }>,
): SeatHold {
  return SeatHold.create({
    seatHoldId: 'sh-1',
    eventId: 'evt-1',
    sectionName: overrides?.sectionName ?? 'VIP',
    row: overrides?.row ?? 1,
    seat: overrides?.seat ?? 15,
    priceInCents: 50000,
    expiresAt: new Date(Date.now() + 600_000), // 10 dk sonra
  });
}

function createTestReservation(overrides?: {
  expiresAt?: Date;
  eventStartsAt?: Date;
  status?: 'PENDING' | 'CONFIRMED';
}): Reservation {
  const expiresAt = overrides?.expiresAt ?? new Date(Date.now() + 600_000);
  const eventStartsAt = overrides?.eventStartsAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  if (overrides?.status === 'CONFIRMED') {
    const reservation = Reservation.create({
      id: 'res-1',
      userId: 'user-1',
      eventId: 'evt-1',
      seatHolds: [createTestSeatHold()],
      totalPrice: Money.fromCents(50000),
      expiresAt,
      eventStartsAt,
    });
    reservation.confirmPayment('pay-1');
    reservation.pullDomainEvents(); // Clear events
    return reservation;
  }

  return Reservation.create({
    id: 'res-1',
    userId: 'user-1',
    eventId: 'evt-1',
    seatHolds: [createTestSeatHold()],
    totalPrice: Money.fromCents(50000),
    expiresAt,
    eventStartsAt,
  });
}

// ── Money Value Object Tests ──

describe('Money Value Object', () => {
  it('should create from cents', () => {
    const money = Money.fromCents(1999);
    expect(money.amountInCents).toBe(1999);
    expect(money.currency).toBe('TRY');
  });

  it('should reject negative amount', () => {
    expect(() => Money.fromCents(-100)).toThrow('cannot be negative');
  });

  it('should reject non-integer amount', () => {
    expect(() => Money.fromCents(19.99)).toThrow('must be an integer');
  });

  it('should add correctly', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(2500);
    const result = a.add(b);
    expect(result.amountInCents).toBe(3500);
    // Original unchanged (immutable)
    expect(a.amountInCents).toBe(1000);
  });

  it('should subtract correctly', () => {
    const a = Money.fromCents(5000);
    const b = Money.fromCents(2000);
    expect(a.subtract(b).amountInCents).toBe(3000);
  });

  it('should reject subtraction resulting in negative', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(2000);
    expect(() => a.subtract(b)).toThrow('negative');
  });

  it('should multiply correctly', () => {
    const money = Money.fromCents(1999);
    const result = money.multiply(3);
    expect(result.amountInCents).toBe(5997); // Exact integer math!
  });

  it('should reject mixed currency operations', () => {
    const try_ = Money.fromCents(1000, 'TRY');
    const usd = Money.fromCents(1000, 'USD');
    expect(() => try_.add(usd)).toThrow('different currencies');
  });

  it('should display correctly', () => {
    const money = Money.fromCents(15000);
    expect(money.toDisplayString()).toBe('150.00 TRY');
  });
});

// ── SeatHold Value Object Tests ──

describe('SeatHold Value Object', () => {
  it('should create with valid data', () => {
    const hold = createTestSeatHold();
    expect(hold.seatKey).toBe('VIP-1-15');
    expect(hold.isExpired()).toBe(false);
  });

  it('should reject past expiry date on create', () => {
    expect(() =>
      SeatHold.create({
        seatHoldId: 'sh-1',
        eventId: 'evt-1',
        sectionName: 'VIP',
        row: 1,
        seat: 1,
        priceInCents: 50000,
        expiresAt: new Date(Date.now() - 1000), // Geçmiş
      }),
    ).toThrow('must be in the future');
  });

  it('should report expired correctly', () => {
    const hold = SeatHold.fromPersistence({
      seatHoldId: 'sh-1',
      eventId: 'evt-1',
      sectionName: 'VIP',
      row: 1,
      seat: 1,
      priceInCents: 50000,
      expiresAt: new Date(Date.now() - 1000), // Geçmiş
    });
    expect(hold.isExpired()).toBe(true);
  });
});

// ── Reservation Entity Tests ──

describe('Reservation Entity', () => {
  describe('Creation', () => {
    it('should create in PENDING status', () => {
      const reservation = createTestReservation();
      expect(reservation.status).toBe('PENDING');
      expect(reservation.isPending()).toBe(true);
      expect(reservation.version).toBe(1);
    });

    it('should emit ReservationCreated event', () => {
      const reservation = createTestReservation();
      const events = reservation.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('reservation.created');
    });
  });

  describe('Confirm Payment', () => {
    it('should transition PENDING → CONFIRMED', () => {
      const reservation = createTestReservation();
      reservation.pullDomainEvents(); // Clear creation event

      reservation.confirmPayment('pay-123');

      expect(reservation.status).toBe('CONFIRMED');
      expect(reservation.isConfirmed()).toBe(true);
      expect(reservation.paymentId).toBe('pay-123');
      expect(reservation.version).toBe(2);

      const events = reservation.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('reservation.confirmed');
    });

    it('should reject confirming EXPIRED reservation', () => {
      const reservation = createTestReservation();
      reservation.expire();

      expect(() => reservation.confirmPayment('pay-123')).toThrow('EXPIRED');
    });

    it('should reject confirming when hold is expired', () => {
      const reservation = createTestReservation({
        expiresAt: new Date(Date.now() - 1000), // Süresi dolmuş
      });

      expect(() => reservation.confirmPayment('pay-123')).toThrow('hold has expired');
    });
  });

  describe('Expire', () => {
    it('should transition PENDING → EXPIRED', () => {
      const reservation = createTestReservation();
      reservation.pullDomainEvents();

      reservation.expire();

      expect(reservation.status).toBe('EXPIRED');
      expect(reservation.version).toBe(2);
    });

    it('should silently ignore if already CONFIRMED', () => {
      const reservation = createTestReservation({ status: 'CONFIRMED' });

      // Race condition: confirm + expire aynı anda çalışabilir
      // Expire sessizce dönmeli, exception fırlatmamalı
      reservation.expire();
      expect(reservation.status).toBe('CONFIRMED');
    });
  });

  describe('Cancel', () => {
    it('should cancel PENDING reservation', () => {
      const reservation = createTestReservation();
      reservation.pullDomainEvents();

      reservation.cancel();

      expect(reservation.status).toBe('CANCELLED');
      const events = reservation.pullDomainEvents();
      expect(events[0]?.type).toBe('reservation.cancelled');
    });

    it('should cancel CONFIRMED reservation (48+ hours before event)', () => {
      const reservation = createTestReservation({
        status: 'CONFIRMED',
        eventStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 gün sonra
      });

      reservation.cancel();
      expect(reservation.status).toBe('CANCELLED');
    });

    it('should reject cancelling CONFIRMED reservation (< 48 hours before event)', () => {
      const reservation = createTestReservation({
        status: 'CONFIRMED',
        eventStartsAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 saat sonra
      });

      expect(() => reservation.cancel()).toThrow('48 hours');
    });

    it('should reject cancelling EXPIRED reservation', () => {
      const reservation = createTestReservation();
      reservation.expire();

      expect(() => reservation.cancel()).toThrow('expired');
    });

    it('should reject double cancel', () => {
      const reservation = createTestReservation();
      reservation.cancel();

      expect(() => reservation.cancel()).toThrow('already cancelled');
    });
  });
});
