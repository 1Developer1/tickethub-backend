/**
 * Booking Module — Zod Validation Schemas
 */

import { z } from 'zod';
import { MAX_SEATS_PER_BOOKING } from '../../config/constants.js';

const seatSelectionSchema = z.object({
  section: z.string().min(1).max(100),
  row: z.number().int().positive(),
  seat: z.number().int().positive(),
});

export const createReservationSchema = z.object({
  eventId: z.string().uuid(),
  seats: z
    .array(seatSelectionSchema)
    .min(1, 'At least one seat must be selected')
    .max(MAX_SEATS_PER_BOOKING, `Maximum ${MAX_SEATS_PER_BOOKING} seats per booking`),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const confirmReservationSchema = z.object({
  paymentId: z.string().min(1),
});

export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;
