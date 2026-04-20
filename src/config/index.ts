/**
 * Config Module — Type-safe environment configuration with Zod
 *
 * NEDEN ZOD İLE ENV VALIDATION?
 * TypeScript sadece compile-time'da kontrol eder. process.env her zaman string | undefined döner.
 * Zod ile runtime'da doğrulama yapıyoruz → uygulama başlarken eksik/yanlış config varsa
 * HEMEN hata verir, 3 saat sonra production'da "undefined is not a function" yerine.
 *
 * YAPMASAYDIK NE OLURDU?
 * process.env.PORT → string | undefined. parseInt yapsan bile NaN olabilir.
 * DATABASE_URL unutulmuş → uygulama başlar, ilk DB sorgusu patlar → kullanıcı hata görür.
 * Zod ile: uygulama BAŞLAMADAN hata verir → sorun anında fark edilir.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // JWT — minimum 32 karakter (256 bit) zorunlu
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters (256 bit)'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters (256 bit)'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),

  // QR Ticket HMAC
  TICKET_HMAC_SECRET: z.string().min(32, 'TICKET_HMAC_SECRET must be at least 32 characters'),

  // Email (SMTP)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().email().default('noreply@tickethub.com'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  // Frontend URL (CORS)
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Invalid environment configuration:');
    console.error(JSON.stringify(formatted, null, 2));
    process.exit(1);
  }

  return result.data;
}

// Singleton — bir kere parse et, her yerde kullan
export const config = loadConfig();

export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return config.NODE_ENV === 'test';
}
