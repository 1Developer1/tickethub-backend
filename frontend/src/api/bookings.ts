import { apiClient } from './client';
import type { ApiResponse, Reservation, ReservationHold, SeatSelection } from '@/types';

export const bookingsApi = {
  async hold(input: {
    eventId: string;
    seats: SeatSelection[];
  }): Promise<ReservationHold> {
    const { data } = await apiClient.post<ApiResponse<ReservationHold>>('/bookings/hold', input);
    return data.data;
  },

  async getById(id: string): Promise<Reservation> {
    const { data } = await apiClient.get<ApiResponse<Reservation>>(`/bookings/${id}`);
    return data.data;
  },

  async confirm(id: string, paymentId: string): Promise<Reservation> {
    const { data } = await apiClient.post<ApiResponse<Reservation>>(`/bookings/${id}/confirm`, {
      paymentId,
    });
    return data.data;
  },

  async cancel(id: string): Promise<Reservation> {
    const { data } = await apiClient.post<ApiResponse<Reservation>>(`/bookings/${id}/cancel`);
    return data.data;
  },

  async releaseHold(id: string): Promise<void> {
    await apiClient.delete(`/bookings/${id}/hold`);
  },
};
