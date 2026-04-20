/**
 * Global Error Handler — Fastify Error Handler Plugin
 *
 * Tüm hataları yakalar, doğru HTTP status code ve tutarlı JSON formatına çevirir.
 *
 * NEDEN GLOBAL ERROR HANDLER?
 * Her route'ta try-catch yazmak yerine, merkezi bir handler:
 * 1. Tutarlı error response formatı (tüm endpoint'lerde aynı { error: { code, message } })
 * 2. Production'da stack trace gizleme (güvenlik)
 * 3. Beklenmeyen hataları loglama (monitoring)
 * 4. Zod validation hatalarını user-friendly formata çevirme
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isProduction } from '../../config/index.js';
import { logger } from '../logger/index.js';
import { AppError, type ErrorResponse } from './base-error.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // 1. Custom AppError → bilinen hata, doğru status code ile dön
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId: request.id }, error.message);
    } else {
      logger.warn({ err: error, requestId: request.id }, error.message);
    }

    reply.status(error.statusCode).send(error.toJSON());
    return;
  }

  // 2. Zod validation hatası → 400 Bad Request
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { errors: details },
      },
    };

    reply.status(400).send(response);
    return;
  }

  // 3. Fastify validation hatası (schema-based) → 400
  if ('validation' in error && error.validation) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
    };

    reply.status(400).send(response);
    return;
  }

  // 4. Beklenmeyen hata → 500 Internal Server Error
  // Bu bir programmer hatası — logla, alert gönder, ama stack trace'i kullanıcıya GÖSTERME
  logger.error(
    {
      err: error,
      requestId: request.id,
      method: request.method,
      url: request.url,
    },
    'Unhandled error',
  );

  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction()
        ? 'An unexpected error occurred'
        : error.message || 'An unexpected error occurred',
      // Development'ta stack trace göster (debugging kolaylığı)
      ...(isProduction() ? {} : { details: { stack: error.stack } }),
    },
  };

  reply.status(500).send(response);
}
