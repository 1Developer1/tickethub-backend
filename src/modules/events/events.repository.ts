/**
 * Events Repository — Data Access Layer + Full-Text Search
 *
 * NEDEN POSTGRESQL FULL-TEXT SEARCH?
 * - Bu ölçekte Elasticsearch OVERKILL (ayrı cluster, index yönetimi, RAM)
 * - PostgreSQL tsvector + GIN index ile "İstanbul konser 2026" araması yeterli
 * - GIN index: tsvector'ü indexler, milyon satırda bile <10ms arama
 *
 * NE ZAMAN ELASTICSEARCH?
 * - Fuzzy matching ("tarcan" → "tarkan"), synonym support, faceted search
 * - 10M+ kayıt ve karmaşık arama gereksinimleri
 * - Bu proje için: PostgreSQL FTS yeterli, operasyonel basitlik kazanıyoruz
 *
 * NOT: tsvector GIN index Prisma'da native desteklenmiyor.
 * Custom migration SQL ile eklenir (aşağıdaki sorgu prisma migration'a eklenmeli):
 *
 * ```sql
 * CREATE INDEX idx_events_search
 *   ON events USING GIN (to_tsvector('english', name || ' ' || description));
 * ```
 */

import type { Prisma, Event } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { decodeCursor } from '../../shared/utils/pagination.js';
import { DEFAULT_PAGE_SIZE } from '../../config/constants.js';
import type { EventQuery } from './events.schema.js';

export const eventRepository = {
  async create(data: Prisma.EventUncheckedCreateInput): Promise<Event> {
    return prisma.event.create({ data });
  },

  async findById(id: string): Promise<(Event & { venue: { id: string; name: string; city: string } }) | null> {
    return prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        venue: { select: { id: true, name: true, city: true } },
      },
    });
  },

  /**
   * Arama + filtreleme + cursor-based pagination.
   *
   * Full-text search: tsvector + plainto_tsquery ile.
   * Prisma native desteklemediği için $queryRawUnsafe kullanıyoruz.
   * Parametreli sorgu → SQL injection koruması sağlanıyor.
   */
  async findMany(query: EventQuery): Promise<Event[]> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    // Full-text search varsa raw query kullan
    if (query.q) {
      return eventRepository.searchWithFullText(query, limit);
    }

    // Normal filtreleme — Prisma ile
    const where: Prisma.EventWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.dateFrom || query.dateTo) {
      where.startsAt = {};
      if (query.dateFrom) where.startsAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startsAt.lte = new Date(query.dateTo);
    }
    if (query.city) {
      where.venue = { city: { contains: query.city, mode: 'insensitive' } };
    }

    // Cursor pagination
    let cursorCondition: Prisma.EventWhereInput | undefined;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      cursorCondition = {
        OR: [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          {
            createdAt: { equals: new Date(decoded.createdAt) },
            id: { lt: decoded.id },
          },
        ],
      };
    }

    return prisma.event.findMany({
      where: {
        ...where,
        ...(cursorCondition ? { AND: cursorCondition } : {}),
      },
      include: {
        venue: { select: { id: true, name: true, city: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  },

  /**
   * Full-text search with tsvector.
   *
   * NEDEN RAW QUERY?
   * Prisma ORM tsvector/tsquery operatörlerini desteklemiyor.
   * $queryRawUnsafe + parametre binding → SQL injection koruması VAR.
   *
   * ❌ ANTI-PATTERN: String interpolation ile SQL oluşturma
   * ```
   * prisma.$queryRawUnsafe(`SELECT * FROM events WHERE name LIKE '%${query}%'`);
   * // ↑ SQL INJECTION açığı! query = "'; DROP TABLE events; --"
   * ```
   *
   * ✅ DOĞRU: Parametreli sorgu
   * ```
   * prisma.$queryRawUnsafe(`SELECT * FROM events WHERE ... @@ plainto_tsquery($1)`, query);
   * // ↑ $1 parametresi otomatik escape edilir
   * ```
   */
  async searchWithFullText(query: EventQuery, limit: number): Promise<Event[]> {
    const events = await prisma.$queryRawUnsafe<Event[]>(
      `
      SELECT e.*, row_to_json(v.*) as venue
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.deleted_at IS NULL
        AND to_tsvector('english', e.name || ' ' || e.description)
            @@ plainto_tsquery('english', $1)
        ${query.status ? 'AND e.status = $2' : ''}
        ${query.category ? `AND e.category = $${query.status ? 3 : 2}` : ''}
      ORDER BY ts_rank(
        to_tsvector('english', e.name || ' ' || e.description),
        plainto_tsquery('english', $1)
      ) DESC, e.created_at DESC
      LIMIT $${getParamIndex(query)}
      `,
      query.q,
      ...(query.status ? [query.status] : []),
      ...(query.category ? [query.category] : []),
      limit + 1,
    );

    return events;
  },

  async update(id: string, data: Prisma.EventUpdateInput): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data,
    });
  },

  async softDelete(id: string): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};

function getParamIndex(query: EventQuery): number {
  let idx = 1; // $1 = search query
  if (query.status) idx++;
  if (query.category) idx++;
  return idx + 1;
}
