/**
 * Pricing Repository — Append-Only Events + Projection CRUD
 */

import type { PricingEventType } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';

export const pricingRepository = {
  /**
   * Pricing event ekle (APPEND-ONLY: INSERT, ASLA UPDATE/DELETE).
   * Bu event'ler fiyat geçmişini oluşturur — silinemez, değiştirilemez.
   */
  async appendEvent(data: {
    eventId: string;
    sectionName: string;
    type: PricingEventType;
    payload: Record<string, unknown>;
  }) {
    return prisma.pricingEvent.create({
      data: {
        eventId: data.eventId,
        sectionName: data.sectionName,
        type: data.type,
        payload: data.payload as object,
      },
    });
  },

  /**
   * Belirli bir etkinlik+bölge için tüm pricing event'leri (kronolojik sırada).
   * Projection rebuild için kullanılır.
   */
  async getEventsForSection(eventId: string, sectionName: string) {
    return prisma.pricingEvent.findMany({
      where: { eventId, sectionName },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Belirli bir etkinlik için TÜM pricing event'leri (admin rapor).
   */
  async getEventsForEvent(eventId: string) {
    return prisma.pricingEvent.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Güncel fiyat projeksiyonunu güncelle (upsert).
   * Bu tablo her zaman pricing_events'ten yeniden oluşturulabilir.
   */
  async upsertCurrentPrice(data: {
    eventId: string;
    sectionName: string;
    basePriceInCents: number;
    currentPriceInCents: number;
    multiplier: number;
  }) {
    return prisma.currentPrice.upsert({
      where: {
        eventId_sectionName: {
          eventId: data.eventId,
          sectionName: data.sectionName,
        },
      },
      create: data,
      update: {
        basePriceInCents: data.basePriceInCents,
        currentPriceInCents: data.currentPriceInCents,
        multiplier: data.multiplier,
      },
    });
  },

  /**
   * Belirli bir etkinlik için tüm güncel fiyatları getir.
   */
  async getCurrentPrices(eventId: string) {
    return prisma.currentPrice.findMany({
      where: { eventId },
    });
  },

  /**
   * Belirli bir bölge için güncel fiyat.
   */
  async getCurrentPrice(eventId: string, sectionName: string) {
    return prisma.currentPrice.findUnique({
      where: {
        eventId_sectionName: { eventId, sectionName },
      },
    });
  },
};
