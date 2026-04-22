import { apiClient } from './client';
import type { ApiResponse, CurrentPrice } from '@/types';

export const pricingApi = {
  async getCurrent(eventId: string): Promise<CurrentPrice[]> {
    const { data } = await apiClient.get<ApiResponse<CurrentPrice[]>>(`/pricing/${eventId}`);
    return data.data;
  },
};
