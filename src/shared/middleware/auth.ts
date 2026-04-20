/**
 * Authentication & Authorization Middleware
 *
 * JWT access token doğrulama + rol bazlı yetkilendirme.
 *
 * NEDEN JWT?
 * - Stateless: her request kendi token'ını taşır, server'da session tutmaya gerek yok
 * - Scalable: birden fazla server instance'da session sync sorunu yok
 * - Kısa ömürlü access token (15 dk) + uzun ömürlü refresh token (7 gün) = güvenlik + UX dengesi
 *
 * NEDEN REFRESH TOKEN ROTATION?
 * Access token çalınırsa → 15 dk sonra geçersiz olur (kısa hasar penceresi).
 * Refresh token çalınırsa → meşru kullanıcı refresh yaptığında çalıntı token geçersiz olur
 * (her refresh'te eski token iptal edilir, yeni token verilir).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../errors/http-errors.js';

export interface JwtPayload {
  sub: string; // userId
  role: 'USER' | 'ORGANIZER' | 'ADMIN';
  iat: number;
  exp: number;
}

// Fastify request'e user bilgisi ekle
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Authentication hook — token doğrula, request.user'a ata.
 * Route seviyesinde { config: { public: true } } ile bypass edilebilir.
 */
export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Public route'ları atla
    const routeConfig = request.routeOptions?.config as { public?: boolean } | undefined;
    if (routeConfig?.public) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7); // "Bearer " kısmını at
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      request.user = payload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw err;
    }
  });
}

/**
 * Authorization guard — belirli roller için erişim kontrolü.
 * Route handler'dan ÖNCE çalışır.
 *
 * @example
 * app.post('/events', { preHandler: [authorize('ORGANIZER', 'ADMIN')] }, handler);
 */
export function authorize(
  ...roles: Array<'USER' | 'ORGANIZER' | 'ADMIN'>
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(
        `This action requires one of these roles: ${roles.join(', ')}`,
      );
    }
  };
}
