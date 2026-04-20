/**
 * Application Constants
 *
 * Magic number'ları tek yerde topla → değiştirmek gerektiğinde 50 dosya taramak yerine
 * buradan değiştir. Her sabit için "neden bu değer" açıklaması var.
 */

/** Reservation hold süresi: 10 dakika (ms). Kullanıcı bu sürede ödeme yapmalı. */
export const RESERVATION_TTL_MS = 10 * 60 * 1000; // 600_000ms = 10 dakika

/** Redlock TTL: Koltuk seçimi sırasındaki distributed lock süresi (ms).
 * 30 saniye — DB transaction + validation süresi yeterli, crash durumunda fazla beklenmez. */
export const SEAT_LOCK_TTL_MS = 30 * 1000;

/** Bir kullanıcının aynı etkinliğe alabileceği maksimum bilet.
 * 6 — scalping/karaborsacılık önlemi. Gerçek dünyada Ticketmaster da benzer sınır koyar. */
export const MAX_SEATS_PER_BOOKING = 6;

/** İptal sınırı: etkinlikten en az 48 saat önce iptal edilebilir. */
export const CANCELLATION_DEADLINE_HOURS = 48;

/** Cursor-based pagination varsayılan sayfa boyutu. */
export const DEFAULT_PAGE_SIZE = 20;

/** Cursor-based pagination maksimum sayfa boyutu. */
export const MAX_PAGE_SIZE = 100;

/** Idempotency key TTL: 24 saat. Aynı ödeme isteği bu süre içinde tekrar gelirse cached response döner. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 86400s = 24 saat

/** Redis cache TTL'leri (saniye) */
export const CACHE_TTL = {
  /** Etkinlik detayı: 5 dakika. Sık okunur, seyrek değişir. */
  EVENT_DETAIL: 300,
  /** Güncel fiyat: 30 saniye. Dinamik fiyatlama nedeniyle sık değişebilir. */
  CURRENT_PRICE: 30,
  /** Müsait koltuk sayısı: 10 saniye. Her bilet satışında değişir. */
  SEAT_AVAILABILITY: 10,
} as const;

/** BullMQ queue isimleri */
export const QUEUE_NAMES = {
  RESERVATION_EXPIRE: 'reservation-expire',
  NOTIFICATION_EMAIL: 'notification-email',
  NOTIFICATION_SMS: 'notification-sms',
  PRICING_RECALCULATE: 'pricing-recalculate',
  TICKET_GENERATE: 'ticket-generate',
} as const;

/** Dynamic pricing thresholds */
export const PRICING_RULES = {
  /** Kalan koltuk < %20 → 1.3x surge */
  LOW_AVAILABILITY_THRESHOLD: 0.2,
  LOW_AVAILABILITY_MULTIPLIER: 1.3,
  /** Kalan koltuk < %5 → 1.8x surge */
  CRITICAL_AVAILABILITY_THRESHOLD: 0.05,
  CRITICAL_AVAILABILITY_MULTIPLIER: 1.8,
  /** Etkinliğe 7 günden az → 1.2x last-minute surge */
  LAST_MINUTE_DAYS: 7,
  LAST_MINUTE_MULTIPLIER: 1.2,
  /** Satışın ilk 48 saati → %15 early bird indirimi */
  EARLY_BIRD_HOURS: 48,
  EARLY_BIRD_DISCOUNT: 0.15,
} as const;

/** API versiyonu prefix */
export const API_PREFIX = '/api/v1';
