/**
 * Venues Service — Business Logic (Basit CRUD)
 *
 * NEDEN BU MODÜLDE DOMAIN MODEL YOK?
 * Mekan oluşturma = veri al + validate et + DB'ye yaz. Hepsi bu.
 * Karmaşık durum geçişleri yok. Invariant kontrolü yok.
 * "createVenue()" sadece veri giriş çıkışı → domain model eklersek:
 * - VenueEntity sınıfı, factory method, toDomain/toPersistence mapper...
 * - Hiçbiri fayda sağlamaz, sadece 200 satır boilerplate ekler.
 *
 * ❌ ANTI-PATTERN: Her modüle domain model koymak
 * ```
 * class VenueEntity {
 *   private constructor(private props: VenueProps) {} // Neden private? İş kuralı yok ki
 *   static create(props: VenueProps) { return new VenueEntity(props); } // Sadece wrapper
 *   getName() { return this.props.name; } // Getter karmaşıklığı
 * }
 * // 50 satır kod, SIFIR fayda. Booking modülünde ise bu pattern DEĞER katıyor.
 * ```
 */

import { NotFoundError } from '../../shared/errors/http-errors.js';
import { type PaginatedResponse, buildPaginatedResponse } from '../../shared/utils/pagination.js';
import { venueRepository } from './venues.repository.js';
import type { CreateVenueInput, UpdateVenueInput } from './venues.schema.js';

interface VenueResponse {
  id: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  seatLayout: Record<string, unknown>;
  createdAt: string;
}

export const venuesService = {
  async create(input: CreateVenueInput): Promise<VenueResponse> {
    const venue = await venueRepository.create({
      name: input.name,
      address: input.address,
      city: input.city,
      capacity: input.capacity,
      seatLayout: input.seatLayout,
    });

    return formatVenue(venue);
  },

  async findById(id: string): Promise<VenueResponse> {
    const venue = await venueRepository.findById(id);
    if (!venue) {
      throw new NotFoundError('Venue', id);
    }
    return formatVenue(venue);
  },

  async findMany(params: {
    city?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResponse<VenueResponse>> {
    const venues = await venueRepository.findMany(params);
    const limit = params.limit ?? 20;
    const formatted = venues.map(formatVenue);

    return buildPaginatedResponse(
      formatted.map((v) => ({ ...v, createdAt: new Date(v.createdAt) })),
      limit,
    ) as unknown as PaginatedResponse<VenueResponse>;
  },

  async update(id: string, input: UpdateVenueInput): Promise<VenueResponse> {
    const existing = await venueRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Venue', id);
    }

    const venue = await venueRepository.update(id, input);
    return formatVenue(venue);
  },

  async remove(id: string): Promise<void> {
    const existing = await venueRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Venue', id);
    }

    await venueRepository.softDelete(id);
  },
};

function formatVenue(venue: {
  id: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  seatLayout: unknown;
  createdAt: Date;
}): VenueResponse {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    city: venue.city,
    capacity: venue.capacity,
    seatLayout: venue.seatLayout as Record<string, unknown>,
    createdAt: venue.createdAt.toISOString(),
  };
}
