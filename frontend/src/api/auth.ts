import { apiClient } from './client';
import type { ApiResponse, AuthResponse, User } from '@/types';

export const authApi = {
  async register(input: { email: string; password: string; name: string }): Promise<AuthResponse> {
    const { data } = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', input);
    return data.data;
  },

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const { data } = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', input);
    return data.data;
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken });
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return data.data.user;
  },
};
