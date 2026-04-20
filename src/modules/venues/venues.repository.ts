/**
 * Venues Repository — Prisma Data Access Layer
 *
 * NEDEN REPOSITORY LAYER?
 * Service'i Prisma'ya doğrudan bağlamak yerine repository kullanıyoruz çünkü:
 * - Service'te iş mantığı, repository'de veri erişimi → sorumluluk ayrımı
 * - Test'te repository'yi mock'lamak kolay (Prisma client'ı mock'lamaktan daha temiz)
 * - Prisma'dan başka ORM'ye geçişte sadece repository değişir
 *
 * NOT: Basit CRUD'da repository "thin wrapper" olabilir — sorun değil.
 * Over-engineering değil, tutarlılık için.
 */

import type { Prisma, Venue } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { decodeCursor } from '../../shared/utils/pagination.js';
import { DEFAULT_PAGE_SIZE } from '../../config/constants.js';

export const venueRepository = {
  async create(data: Prisma.VenueCreateInput): Promise<Venue> {
    return prisma.venue.create({ data });
  },

  async findById(id: string): Promise<Venue | null> {
    return prisma.venue.findFirst({
      where: { id, deletedAt: null },
    });
  },

  async findMany(params: {
    city?: string;
    cursor?: string;
    limit?: number;
  }): Promise<Venue[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.VenueWhereInput = { deletedAt: null };

    if (params.city) {
      where.city = { contains: params.city, mode: 'insensitive' };
    }

    // Cursor-based pagination
    let cursorCondition: Prisma.VenueWhereInput | undefined;
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
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

    return prisma.venue.findMany({
      where: {
        ...where,
        ...(cursorCondition ? { AND: cursorCondition } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // N+1 pattern: hasMore kontrolü
    });
  },

  async update(id: string, data: Prisma.VenueUpdateInput): Promise<Venue> {
    return prisma.venue.update({
      where: { id },
      data,
    });
  },

  async softDelete(id: string): Promise<Venue> {
    return prisma.venue.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
