/**
 * Error Hierarchy — Custom Error Classes
 *
 * NEDEN CUSTOM ERROR HIERARCHY?
 * JavaScript'in native Error'u sadece message ve stack trace içerir.
 * HTTP API'de her hatanın: status code, machine-readable code, user-friendly message'ı lazım.
 *
 * NEDEN isOperational FLAG?
 * İki tür hata var:
 * 1. Operational (beklenen): "Koltuk müsait değil", "Token expired" → 4xx döner, uygulama devam eder
 * 2. Programmer (beklenmeyen): null reference, type error → 500 döner, belki restart gerekir
 * isOperational = true → operational hata, graceful handle et
 * isOperational = false → programmer hatası, logla + alert gönder
 *
 * YAPMASAYDIK NE OLURDU?
 * Her route handler'da try-catch + status code + error format yazardık.
 * 50 endpoint × aynı boilerplate = bakım kabusu. Bir format değişikliği 50 yerde güncelleme.
 */

export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      isOperational?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.isOperational = options?.isOperational ?? true;
    this.details = options?.details;

    // V8 stack trace'i bu sınıftan başlasın, constructor frame'i gizlensin
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * API response'a dönüştür.
   * Production'da stack trace GİZLE (güvenlik), development'ta göster (debugging).
   */
  toJSON(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
