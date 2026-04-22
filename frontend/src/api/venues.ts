import { apiClient } from './client';
import type { ApiResponse, Venue } from '@/types';

export const venuesApi = {
  async list(params: { city?: string; limit?: number } = {}): Promise<Venue[]> {
    const { data } = await apiClient.get<ApiResponse<Venue[]>>('/venues', { params });
    return data.data;
  },

  async getById(id: string): Promise<Venue> {
    const { data } = await apiClient.get<ApiResponse<Venue>>(`/venues/${id}`);
    return data.data;
  },
};
