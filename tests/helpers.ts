/**
 * Test Helpers — App builder, auth token generator, DB cleanup
 */

import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma-client.js';
import type { JwtPayload } from '../src/shared/middleware/auth.js';

/**
 * Test için Fastify app oluştur.
 * Her test dosyasında: const app = await buildTestApp();
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/**
 * Test için JWT token üret.
 * Gerçek register/login akışından geçmeden korumalı endpoint'leri test et.
 */
export function createAuthToken(
  userId: string,
  role: 'USER' | 'ORGANIZER' | 'ADMIN' = 'USER',
): string {
  const secret = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-at-least-32-characters-long';

  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: userId,
    role,
  };

  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Tüm tabloları temizle — her test'ten önce çağır.
 * Sıralama önemli: FK constraint'leri nedeniyle child tablolar önce silinmeli.
 */
export async function cleanDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.seatHold.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.currentPrice.deleteMany(),
    prisma.pricingEvent.deleteMany(),
    prisma.event.deleteMany(),
    prisma.venue.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/**
 * Test factory: kullanıcı oluştur
 */
export async function createTestUser(overrides?: {
  email?: string;
  name?: string;
  role?: 'USER' | 'ORGANIZER' | 'ADMIN';
}) {
  return prisma.user.create({
    data: {
      email: overrides?.email ?? `test-${Date.now()}@tickethub.com`,
      passwordHash: 'test-hash-not-real',
      name: overrides?.name ?? 'Test User',
      role: overrides?.role ?? 'USER',
    },
  });
}

/**
 * Test factory: venue oluştur
 */
export async function createTestVenue(overrides?: { name?: string }) {
  return prisma.venue.create({
    data: {
      name: overrides?.name ?? 'Test Venue',
      address: 'Test Address 123',
      city: 'İstanbul',
      capacity: 1000,
      seatLayout: {
        VIP: { rows: 5, seatsPerRow: 20, basePriceInCents: 50000 },
        Normal: { rows: 20, seatsPerRow: 40, basePriceInCents: 15000 },
      },
    },
  });
}

/**
 * Test factory: event oluştur
 */
export async function createTestEvent(
  venueId: string,
  organizerId: string,
  overrides?: {
    name?: string;
    status?: 'DRAFT' | 'PUBLISHED';
  },
) {
  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return prisma.event.create({
    data: {
      venueId,
      organizerId,
      name: overrides?.name ?? 'Test Event',
      description: 'A test event for automated testing',
      category: 'CONCERT',
      status: overrides?.status ?? 'PUBLISHED',
      startsAt: inTwoWeeks,
      endsAt: new Date(inTwoWeeks.getTime() + 3 * 60 * 60 * 1000),
      salesStartAt: now,
      salesEndAt: new Date(inTwoWeeks.getTime() - 2 * 60 * 60 * 1000),
    },
  });
}
