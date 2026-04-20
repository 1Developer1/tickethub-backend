/**
 * Venues Module — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { createVenueSchema, updateVenueSchema } from '../venues.schema.js';

describe('Venues Schema Validation', () => {
  describe('createVenueSchema', () => {
    it('should accept valid venue data', () => {
      const result = createVenueSchema.safeParse({
        name: 'Harbiye Açıkhava',
        address: 'Harbiye, Taşkışla Cd., Şişli',
        city: 'İstanbul',
        capacity: 4000,
        seatLayout: {
          VIP: { rows: 5, seatsPerRow: 20, basePriceInCents: 75000 },
          Normal: { rows: 20, seatsPerRow: 40, basePriceInCents: 20000 },
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject venue with negative capacity', () => {
      const result = createVenueSchema.safeParse({
        name: 'Test Venue',
        address: 'Test Address 123',
        city: 'Test City',
        capacity: -100,
        seatLayout: {},
      });

      expect(result.success).toBe(false);
    });

    it('should reject venue with invalid seat layout', () => {
      const result = createVenueSchema.safeParse({
        name: 'Test Venue',
        address: 'Test Address 123',
        city: 'Test City',
        capacity: 1000,
        seatLayout: {
          VIP: { rows: -1, seatsPerRow: 20, basePriceInCents: 50000 },
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject short name', () => {
      const result = createVenueSchema.safeParse({
        name: 'X',
        address: 'Test Address 123',
        city: 'Test City',
        capacity: 1000,
        seatLayout: {},
      });

      expect(result.success).toBe(false);
    });
  });

  describe('updateVenueSchema', () => {
    it('should accept partial update', () => {
      const result = updateVenueSchema.safeParse({
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
        expect(result.data.address).toBeUndefined();
      }
    });

    it('should accept empty object (no update)', () => {
      const result = updateVenueSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
