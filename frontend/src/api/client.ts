import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { ApiError } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

// ── Request interceptor: attach JWT ──
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: refresh on 401 ──
interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const store = useAuthStore.getState();
  const refreshToken = store.refreshToken;

  if (!refreshToken) {
    store.clear();
    throw new Error('No refresh token');
  }

  const response = await axios.post<{
    data: { accessToken: string; refreshToken: string };
  }>(`${API_URL}/auth/refresh`, { refreshToken });

  const newTokens = response.data.data;
  store.updateTokens(newTokens);
  return newTokens.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as RetryConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login')
    ) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = performRefresh();
        }
        const newToken = await refreshPromise;
        refreshPromise = null;

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        refreshPromise = null;
        useAuthStore.getState().clear();
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

/** Extract a human-friendly error message from an axios error. */
export function extractError(err: unknown): string {
  if (axios.isAxiosError<ApiError>(err)) {
    return err.response?.data?.error?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Beklenmeyen bir hata oluştu';
}
