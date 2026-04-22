import { apiClient } from './client';
import type { ApiResponse, Ticket } from '@/types';

export const ticketsApi = {
  async myTickets(): Promise<Ticket[]> {
    const { data } = await apiClient.get<ApiResponse<Ticket[]>>('/tickets');
    return data.data;
  },

  async getById(id: string): Promise<Ticket> {
    const { data } = await apiClient.get<ApiResponse<Ticket>>(`/tickets/${id}`);
    return data.data;
  },

  getQrImageUrl(id: string): string {
    // Direct URL — useful for <img> tags
    return `${apiClient.defaults.baseURL}/tickets/${id}/qr`;
  },
};
