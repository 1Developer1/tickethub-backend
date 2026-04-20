/**
 * Venues Module — Zod Validation Schemas
 *
 * Bu modül ne yapıyor: Mekan ve koltuk düzeni yönetimi (basit CRUD).
 * Hangi pattern: Basit service → Prisma CRUD. Domain model YOK.
 * Neden basit: Karmaşık iş kuralı yok. Mekan oluştur, düzenle, listele.
 *   Koltuk düzeni bir JSONB olarak saklanıyor — bütünsel değişiyor.
 */

import { z } from 'zod';

// Koltuk bölge tanımı
const seatSectionSchema = z.object({
  rows: z.number().int().positive().max(100),
  seatsPerRow: z.number().int().positive().max(200),
  basePriceInCents: z.number().int().nonnegative(),
});

// ── Create Venue ──
export const createVenueSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  address: z.string().min(5).max(500).trim(),
  city: z.string().min(2).max(100).trim(),
  capacity: z.number().int().positive().max(200_000),
  // JSONB: Bölge adı → koltuk bilgisi
  // Neden JSONB? Koltuk düzeni bir BÜTÜN olarak değişiyor.
  // Ayrı tablo yapıp normalize etmek gereksiz karmaşıklık — tek salon düzenlemesinde
  // tüm bölgeler birlikte güncelleniyor.
  seatLayout: z.record(z.string(), seatSectionSchema),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;

// ── Update Venue ──
export const updateVenueSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  address: z.string().min(5).max(500).trim().optional(),
  city: z.string().min(2).max(100).trim().optional(),
  capacity: z.number().int().positive().max(200_000).optional(),
  seatLayout: z.record(z.string(), seatSectionSchema).optional(),
});

export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

// ── Query ──
export const venueQuerySchema = z.object({
  city: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type VenueQuery = z.infer<typeof venueQuerySchema>;
