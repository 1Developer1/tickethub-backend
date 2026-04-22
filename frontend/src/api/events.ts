import { apiClient } from './client';
import type { ApiResponse, Event, EventCategory, EventStatus, PagedResponse } from '@/types';

export interface EventFilters {
  q?: string;
  city?: string;
  category?: EventCategory;
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export const eventsApi = {
  async list(filters: EventFilters = {}): Promise<PagedResponse<Event>> {
    const { data } = await apiClient.get<PagedResponse<Event>>('/events', {
      params: { status: 'PUBLISHED', ...filters },
    });
    return data;
  },

  async getById(id: string): Promise<Event> {
    const { data } = await apiClient.get<ApiResponse<Event>>(`/events/${id}`);
    return data.data;
  },
};
