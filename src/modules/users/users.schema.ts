/**
 * Users Module — Zod Validation Schemas
 *
 * NEDEN ZOD RUNTIME VALIDATION?
 * TypeScript sadece compile-time'da kontrol eder. Kullanıcıdan gelen veri (HTTP request body)
 * TypeScript tip güvenliğini BYPASS eder — API boundary'de runtime validation ZORUNLU.
 *
 * Örnek: TypeScript diyor ki email: string ama kullanıcı { email: 12345 } gönderiyor.
 * Zod olmadan: 12345 string olarak işlenir → DB'ye yazılır → email gönderilemez.
 * Zod ile: "Expected string, received number" → 400 Bad Request → kullanıcı düzeltir.
 */

import { z } from 'zod';

// ── Register ──
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255)
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ── Login ──
export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ── Refresh Token ──
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

// ── Response Schemas (documentation + type safety) ──
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['USER', 'ORGANIZER', 'ADMIN']),
  createdAt: z.string().datetime(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userResponseSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
