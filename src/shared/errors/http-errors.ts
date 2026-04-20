/**
 * HTTP Error Classes
 *
 * Her error sınıfı bir HTTP status code'a karşılık gelir.
 * İş kuralı hataları (SeatUnavailable, HoldExpired) vs altyapı hataları (ExternalService) ayrımı:
 * - İş kuralı hataları: kullanıcının yanlış yaptığı bir şey veya iş kuralı engeli
 * - Altyapı hataları: dış servis veya sistem problemi, kullanıcının suçu değil
 */

import { AppError } from './base-error.js';

/** 400 — Geçersiz istek (validation hatası, yanlış format) */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { details });
  }
}

/** 401 — Kimlik doğrulaması gerekli (token yok veya geçersiz) */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/** 403 — Yetki yok (token geçerli ama bu işlem için rolü yeterli değil) */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

/** 404 — Kaynak bulunamadı */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
  }
}

/** 409 — Çakışma (aynı koltuk iki kişiye satılmaya çalışılıyor, stale data) */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { details });
  }
}

/** 409 — Koltuk müsait değil (başka biri tarafından hold edilmiş veya satılmış) */
export class SeatUnavailableError extends AppError {
  readonly statusCode = 409;
  readonly code = 'SEAT_UNAVAILABLE';

  constructor(seatInfo: string) {
    super(`Seat ${seatInfo} is not available`, {
      details: { seat: seatInfo },
    });
  }
}

/** 410 — Rezervasyon süresi dolmuş (hold expired) */
export class HoldExpiredError extends AppError {
  readonly statusCode = 410;
  readonly code = 'HOLD_EXPIRED';

  constructor(reservationId: string) {
    super('Reservation hold has expired', {
      details: { reservationId },
    });
  }
}

/** 402 — Ödeme başarısız */
export class PaymentError extends AppError {
  readonly statusCode = 402;
  readonly code = 'PAYMENT_FAILED';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { details });
  }
}

/** 429 — Çok fazla istek (rate limit aşıldı) */
export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(message = 'Too many requests, please try again later') {
    super(message);
  }
}

/** 502 — Dış servis hatası (Stripe yanıt vermiyor, SMS servisi down) */
export class ExternalServiceError extends AppError {
  readonly statusCode = 502;
  readonly code = 'EXTERNAL_SERVICE_ERROR';

  constructor(service: string, cause?: Error) {
    super(`External service '${service}' is unavailable`, {
      isOperational: true,
      cause,
      details: { service },
    });
  }
}
