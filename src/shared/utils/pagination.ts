/**
 * Cursor-Based Pagination Helpers
 *
 * NEDEN CURSOR-BASED, OFFSET DEĞİL?
 *
 * OFFSET sorunu (Anti-pattern):
 * ```sql
 * SELECT * FROM events ORDER BY created_at OFFSET 999000 LIMIT 20;
 * ```
 * PostgreSQL 999.000 satırı okuyup ATIYOR, sonra 20 satır döndürüyor.
 * 1M satırda: ~5 saniye. Her sayfa ileri gittikçe DAHA YAVAŞ.
 *
 * CURSOR (Keyset pagination):
 * ```sql
 * SELECT * FROM events WHERE (created_at, id) > ($cursor_date, $cursor_id)
 *   ORDER BY created_at, id LIMIT 20;
 * ```
 * Index kullanır → O(1) performans. 1. sayfa ile 50.000. sayfa AYNI HIZDA.
 *
 * Ayrıca: OFFSET'te arada veri eklenirse/silinirse sayfa kayar (aynı kayıt tekrar görünür
 * veya hiç görünmez). Cursor'da bu sorun yok.
 *
 * NEDEN BASE64 ENCODE?
 * Cursor içeriği (createdAt + id) implementation detail — client bilmemeli.
 * Base64 encode edilmiş opaque string olarak ver → client sadece "bir sonraki sayfaya git" der.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants.js';

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    count: number;
  };
}

interface CursorData {
  id: string;
  createdAt: string;
}

/** Cursor encode — { id, createdAt } → Base64 string */
export function encodeCursor(id: string, createdAt: Date): string {
  const data: CursorData = { id, createdAt: createdAt.toISOString() };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/** Cursor decode — Base64 string → { id, createdAt } */
export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json) as CursorData;

    if (!data.id || !data.createdAt) {
      throw new Error('Invalid cursor data');
    }

    return data;
  } catch {
    throw new Error('Invalid cursor format');
  }
}

/** Query'den pagination parametrelerini parse et */
export function parsePaginationParams(query: {
  cursor?: string;
  limit?: string | number;
}): CursorPaginationParams {
  const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  return {
    cursor: query.cursor || undefined,
    limit,
  };
}

/**
 * Paginated response oluştur.
 * N+1 pattern: limit+1 kayıt çek → limit+1'inci kayıt varsa hasMore=true.
 */
export function buildPaginatedResponse<T extends { id: string; createdAt: Date }>(
  items: T[],
  limit: number,
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];

  return {
    data,
    meta: {
      cursor: lastItem ? encodeCursor(lastItem.id, lastItem.createdAt) : null,
      hasMore,
      count: data.length,
    },
  };
}
