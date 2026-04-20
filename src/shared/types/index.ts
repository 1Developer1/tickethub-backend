/**
 * Shared TypeScript Types
 */

/** Authenticated request'te bulunan user bilgisi */
export interface AuthUser {
  sub: string;
  role: 'USER' | 'ORGANIZER' | 'ADMIN';
}

/** Generic API success response wrapper */
export interface ApiResponse<T> {
  data: T;
}

/** Generic API list response with pagination */
export interface ApiListResponse<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    count: number;
  };
}
