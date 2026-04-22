import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.accessToken));
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
