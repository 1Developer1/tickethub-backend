import { apiClient } from './client';
import type { ApiResponse } from '@/types';

export interface PaymentResponse {
  success: boolean;
  paymentIntentId: string;
  status: 'succeeded' | 'failed' | 'pending';
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
