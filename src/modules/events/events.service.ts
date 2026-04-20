/**
 * Events Module — Business Logic
 *
 * Basit CRUD + arama + Redis cache. Domain model yok.
 *
 * REDIS CACHE STRATEJİSİ:
 * Etkinlik detay sayfası: ünlü sanatçının bileti satışa açıldığında 100.000 kişi
 * aynı anda detay sayfasına bakıyor. Her biri DB sorgusu yaparsa → DB çöker.
 *
 * Cache-aside pattern:
 * 1. Redis'te var mı? → Evet: hemen dön (cache HIT, ~0.1ms)
 * 2. Hayır: DB'den oku → Redis'e yaz → dön (cache MISS, ~5ms)
 * 3. Etkinlik güncellendiğinde → Redis'ten sil (invalidation)
 *
 * TTL: 5 dakika. Etkinlik bilgisi sık değişmez, 5 dk stale veri kabul edilebilir.
 * Ama güncelleme yapıldığında anında invalidate ediyoruz.
 */

import { eventRepository } from './events.repository.js';
import { NotFoundError, ForbiddenError } from '../../shared/errors/http-errors.js';
import { cache } from '../../shared/redis/cache.js';
import { CACHE_TTL } from '../../config/constants.js';
import { buildPaginatedResponse } from '../../shared/utils/pagination.js';
import type { CreateEventInput, UpdateEventInput, EventQuery } from './events.schema.js';
import { logger } from '../../shared/logger/index.js';

const CACHE_KEY_PREFIX = 'event:';

export const eventsService = {
  async create(organizerId: string, input: CreateEventInput) {
    const event = await eventRepository.create({
      venueId: input.venueId,
      organizerId,
      name: input.name,
      description: input.description,
      category: input.category,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      salesStartAt: new Date(input.salesStartAt),
      salesEndAt: new Date(input.salesEndAt),
      posterUrl: input.posterUrl,
    });

    logger.info({ eventId: event.id, name: event.name }, 'Event created');
    return event;
  },

  async findById(id: string) {
    // Cache-aside: önce Redis'e bak
    return cache.getOrSet(
      `${CACHE_KEY_PREFIX}${id}`,
      async () => {
        const event = await eventRepository.findById(id);
        if (!event) throw new NotFoundError('Event', id);
        return event;
      },
      CACHE_TTL.EVENT_DETAIL,
    );
  },

  async search(query: EventQuery) {
    const events = await eventRepository.findMany(query);
    const limit = query.limit ?? 20;
    return buildPaginatedResponse(events, limit);
  },

  async update(id: string, userId: string, userRole: string, input: UpdateEventInput) {
    const event = await eventRepository.findById(id);
    if (!event) throw new NotFoundError('Event', id);

    // Sadece etkinlik sahibi veya admin güncelleyebilir
    if (event.organizerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenError('You can only update your own events');
    }

    const updated = await eventRepository.update(id, {
      ...input,
      ...(input.startsAt ? { startsAt: new Date(input.startsAt) } : {}),
      ...(input.endsAt ? { endsAt: new Date(input.endsAt) } : {}),
      ...(input.salesStartAt ? { salesStartAt: new Date(input.salesStartAt) } : {}),
      ...(input.salesEndAt ? { salesEndAt: new Date(input.salesEndAt) } : {}),
    });

    // Cache invalidation: güncelleme yapıldı → eski cache'i sil
    await cache.del(`${CACHE_KEY_PREFIX}${id}`);

    logger.info({ eventId: id }, 'Event updated, cache invalidated');
    return updated;
  },

  async remove(id: string, userId: string, userRole: string) {
    const event = await eventRepository.findById(id);
    if (!event) throw new NotFoundError('Event', id);

    if (event.organizerId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenError('You can only delete your own events');
    }

    await eventRepository.softDelete(id);
    await cache.del(`${CACHE_KEY_PREFIX}${id}`);
    logger.info({ eventId: id }, 'Event soft-deleted, cache invalidated');
  },
};
