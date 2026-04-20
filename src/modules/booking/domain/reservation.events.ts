/**
 * Reservation Domain Events
 *
 * Entity İÇİNDE üretilen event'ler. Service katmanında sync/async event bus'a yayınlanır.
 * Neden entity içinde? Business rule'lar entity'de → hangi event'in üretileceğine entity karar verir.
 */

export interface ReservationCreatedEvent {
  type: 'reservation.created';
  reservationId: string;
  userId: string;
  eventId: string;
  seats: Array<{ section: string; row: number; seat: number }>;
  totalPriceInCents: number;
}

export interface ReservationConfirmedEvent {
  type: 'reservation.confirmed';
  reservationId: string;
  userId: string;
  eventId: string;
  paymentId: string;
}

export interface ReservationExpiredEvent {
  type: 'reservation.expired';
  reservationId: string;
  eventId: string;
  seats: Array<{ section: string; row: number; seat: number }>;
}

export interface ReservationCancelledEvent {
  type: 'reservation.cancelled';
  reservationId: string;
  userId: string;
  eventId: string;
  refundRequired: boolean;
}

export type ReservationDomainEvent =
  | ReservationCreatedEvent
  | ReservationConfirmedEvent
  | ReservationExpiredEvent
  | ReservationCancelledEvent;
