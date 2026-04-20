/**
 * Domain Event Types — Event Bus Contract
 *
 * İKİ KATMANLI EVENT SİSTEMİ:
 *
 * 1. SYNC (In-process): Aynı transaction içinde, anında olması gereken şeyler.
 *    Örnek: Koltuk hold request'i → stok kontrolü. Başarısızsa exception → reservation oluşmaz.
 *    → Neden sync? Stok kontrolü BAŞARISIZ olursa reservation OLUŞMAMALI (aynı transaction).
 *
 * 2. ASYNC (BullMQ): Uzun süren, kullanıcıyı bekletmeyen işler.
 *    Örnek: Email gönderimi, QR kod üretimi, pricing recalculate.
 *    → Neden async? Email gönderimi 2 saniye sürüyor → kullanıcıyı bekletme.
 *    → Başarısız olursa? Retry. Email 3 denemede de gitmezse → dead letter queue.
 *    → Kullanıcı etkilenir mi? Hayır — reservation zaten oluşmuş, email sonra gider.
 */

/** Base domain event interface */
export interface DomainEvent<TPayload = unknown> {
  /** Event tipi — routing için kullanılır */
  type: string;
  /** Event verisi */
  payload: TPayload;
  /** Oluşturulma zamanı */
  occurredAt: Date;
  /** Hangi aggregate/entity'den geldi */
  aggregateId: string;
}

/** Tüm domain event tiplerinin map'i — type safety için */
export interface EventMap {
  // Booking events
  'reservation.created': {
    reservationId: string;
    userId: string;
    eventId: string;
    seats: Array<{ section: string; row: number; seat: number }>;
    totalPriceInCents: number;
  };
  'reservation.confirmed': {
    reservationId: string;
    userId: string;
    eventId: string;
    paymentId: string;
  };
  'reservation.expired': {
    reservationId: string;
    eventId: string;
    seats: Array<{ section: string; row: number; seat: number }>;
  };
  'reservation.cancelled': {
    reservationId: string;
    userId: string;
    eventId: string;
    refundRequired: boolean;
  };

  // Seat events
  'seat.held': {
    eventId: string;
    seatKey: string;
    userId: string;
    expiresAt: string;
  };
  'seat.released': {
    eventId: string;
    seatKey: string;
  };

  // Pricing events
  'pricing.recalculate': {
    eventId: string;
    reason: string;
  };

  // Ticket events
  'ticket.generated': {
    ticketId: string;
    reservationId: string;
    userId: string;
  };

  // Notification events
  'notification.send': {
    type:
      | 'BOOKING_CONFIRMED'
      | 'BOOKING_CANCELLED'
      | 'BOOKING_EXPIRED'
      | 'TICKET_READY'
      | 'EVENT_REMINDER';
    recipientId: string;
    recipientEmail: string;
    data: Record<string, unknown>;
  };
}

/** Event handler fonksiyonu */
export type EventHandler<T extends keyof EventMap> = (payload: EventMap[T]) => Promise<void>;
