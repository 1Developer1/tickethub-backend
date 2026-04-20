/**
 * Events Module — Unit Tests
 */

import { describe, expect, it } from 'vitest';
import { createEventSchema, eventQuerySchema } from '../events.schema.js';

describe('Events Schema Validation', () => {
  const validEvent = {
    venueId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Tarkan Concert 2026',
    description: 'An amazing concert with Tarkan performing live at the arena.',
    category: 'CONCERT',
    startsAt: '2026-07-15T20:00:00.000Z',
    endsAt: '2026-07-15T23:00:00.000Z',
    salesStartAt: '2026-04-01T00:00:00.000Z',
    salesEndAt: '2026-07-15T18:00:00.000Z',
  };

  describe('createEventSchema', () => {
    it('should accept valid event data', () => {
      const result = createEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject event where end date is before start date', () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        endsAt: '2026-07-15T19:00:00.000Z', // Before startsAt
      });
      expect(result.success).toBe(false);
    });

    it('should reject event where sales end after event starts', () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        salesEndAt: '2026-07-15T21:00:00.000Z', // After startsAt
      });
      expect(result.success).toBe(false);
    });

    it('should reject short name', () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        name: 'AB',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short description', () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        description: 'Short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid category', () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        category: 'INVALID_CATEGORY',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('eventQuerySchema', () => {
    it('should accept empty query (no filters)', () => {
      const result = eventQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept search query', () => {
      const result = eventQuerySchema.safeParse({ q: 'konser istanbul' });
      expect(result.success).toBe(true);
    });

    it('should accept all filters combined', () => {
      const result = eventQuerySchema.safeParse({
        q: 'rock',
        city: 'İstanbul',
        category: 'CONCERT',
        status: 'PUBLISHED',
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.000Z',
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit above 100', () => {
      const result = eventQuerySchema.safeParse({ limit: 500 });
      expect(result.success).toBe(false);
    });
  });
});
