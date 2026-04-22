import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface PaymentResponse {
  id: string;
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  amountInCents: number;
}

export const paymentsApi = {
  async charge(input: {
    reservationId: string;
    amountInCents: number;
    idempotencyKey: string;
  }): Promise<PaymentResponse> {
    const { data } = await apiClient.post<ApiResponse<PaymentResponse>>(
      '/payments/charge',
      { reservationId: input.reservationId, amountInCents: input.amountInCents },
      { headers: { 'Idempotency-Key': input.idempotencyKey } },
    );
    return data.data;
  },
};
