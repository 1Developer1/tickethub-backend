// ── Domain types — matches backend shapes ──

export type EventCategory = 'CONCERT' | 'THEATER' | 'SPORTS' | 'FESTIVAL' | 'OTHER';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED' | 'SOLD_OUT';
export type UserRole = 'USER' | 'ORGANIZER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  seatLayout: SeatLayout;
}

export interface SeatLayout {
  [section: string]: SeatSection;
}

export interface SeatSection {
  rows: number;
  seatsPerRow: number;
  basePriceInCents: number;
}

export interface Event {
  id: string;
  venueId: string;
  organizerId: string;
  name: string;
  description: string | null;
  category: EventCategory;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  salesStartAt: string;
  salesEndAt: string;
  posterUrl: string | null;
  venue?: {
    id: string;
    name: string;
    city: string;
  };
}

export interface SeatSelection {
  section: string;
  row: number;
  seat: number;
}

export interface SeatHold extends SeatSelection {
  priceInCents: number;
}

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface Reservation {
  id: string;
  userId: string;
  eventId: string;
  status: ReservationStatus;
  totalPriceInCents: number;
  expiresAt: string;
  confirmedAt: string | null;
  seatHolds: SeatHold[];
}

export interface CurrentPrice {
  sectionName: string;
  basePriceInCents: number;
  currentPriceInCents: number;
  multiplier: number;
}

export interface Ticket {
  id: string;
  reservationId: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  qrPayload: string;
  createdAt: string;
}

// ── API wrapper ──

export interface ApiResponse<T> {
  data: T;
}

export interface PagedResponse<T> {
  data: T[];
  hasMore: boolean;
  cursor?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ── Auth ──

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
