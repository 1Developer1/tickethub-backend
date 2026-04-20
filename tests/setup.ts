/**
 * Test Setup — Testcontainers ile gerçek PostgreSQL ve Redis
 *
 * NEDEN TESTCONTAINERS?
 * - SQLite in-memory: PostgreSQL gibi davranmıyor (lock, transaction isolation, JSONB, tsvector farklı)
 * - Mock DB: gerçek sorguları test etmiyor, entegrasyon hataları kaçırılır
 * - Testcontainers: gerçek PostgreSQL + Redis container başlatır, test biter temizler
 *   → "works on my machine" sorunu yok, CI'da da aynı şekilde çalışır
 *
 * DİKKAT: Docker çalışıyor olmalı!
 */

import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

export async function setupTestContainers(): Promise<{
  databaseUrl: string;
  redisUrl: string;
}> {
  // PostgreSQL container başlat
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tickethub_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  // Redis container başlat
  redisContainer = await new RedisContainer('redis:7-alpine').start();

  const databaseUrl = pgContainer.getConnectionUri();
  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getPort();

  // Environment variables set et
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.REDIS_PASSWORD = '';
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
  process.env.TICKET_HMAC_SECRET = 'test-hmac-secret-at-least-32-characters-long-x';
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';

  // Prisma migration çalıştır
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  return { databaseUrl, redisUrl: `redis://${redisHost}:${redisPort}` };
}

export async function teardownTestContainers(): Promise<void> {
  if (pgContainer) await pgContainer.stop();
  if (redisContainer) await redisContainer.stop();
}
