import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;

  setAuth: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  updateTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setAuth: (tokens, user) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
        }),

      updateTokens: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }),

      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
        }),

      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: 'tickethub-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
