/**
 * Events Module — Zod Validation Schemas
 *
 * Bu modül ne yapıyor: Etkinlik CRUD + full-text arama + filtreleme.
 * Hangi pattern: Basit service/repository + Redis cache. Domain model YOK.
 * Neden basit: Etkinlik oluşturma = veri al + validate et + DB'ye yaz. İş kuralı basit.
 */

import { z } from 'zod';

// ── Create Event ──
export const createEventSchema = z
  .object({
    venueId: z.string().uuid(),
    name: z.string().min(3).max(300).trim(),
    description: z.string().min(10).max(5000).trim(),
    category: z.enum(['CONCERT', 'THEATER', 'SPORTS', 'FESTIVAL', 'COMEDY', 'CONFERENCE', 'OTHER']),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    salesStartAt: z.string().datetime(),
    salesEndAt: z.string().datetime(),
    posterUrl: z.string().url().optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'End date must be after start date',
    path: ['endsAt'],
  })
  .refine((data) => new Date(data.salesEndAt) <= new Date(data.startsAt), {
    message: 'Sales must end before event starts',
    path: ['salesEndAt'],
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;

// ── Update Event ──
export const updateEventSchema = z.object({
  name: z.string().min(3).max(300).trim().optional(),
  description: z.string().min(10).max(5000).trim().optional(),
  category: z
    .enum(['CONCERT', 'THEATER', 'SPORTS', 'FESTIVAL', 'COMEDY', 'CONFERENCE', 'OTHER'])
    .optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'SOLD_OUT']).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  salesStartAt: z.string().datetime().optional(),
  salesEndAt: z.string().datetime().optional(),
  posterUrl: z.string().url().nullable().optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ── Search & Filter Query ──
export const eventQuerySchema = z.object({
  q: z.string().max(200).optional(), // Full-text search query
  city: z.string().optional(), // Venue city filter
  category: z
    .enum(['CONCERT', 'THEATER', 'SPORTS', 'FESTIVAL', 'COMEDY', 'CONFERENCE', 'OTHER'])
    .optional(),
  dateFrom: z.string().datetime().optional(), // Tarih aralığı başlangıç
  dateTo: z.string().datetime().optional(), // Tarih aralığı bitiş
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'SOLD_OUT']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type EventQuery = z.infer<typeof eventQuerySchema>;
