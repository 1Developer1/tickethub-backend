import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.getMe,
    initialData: user ?? undefined,
  });

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-secondary mb-1">Profil</h1>
        <p className="text-text-muted mb-6">Hesap bilgilerin</p>

        <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-100">
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : data ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold">
                  {data.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-secondary">{data.name}</h2>
                  <p className="text-sm text-text-muted">{data.email}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-3">
                <Row label="Rol">
                  <Badge tone={data.role === 'ADMIN' ? 'accent' : 'neutral'}>
                    {data.role}
                  </Badge>
                </Row>
                <Row label="Üyelik">
                  {new Date(data.createdAt).toLocaleDateString('tr-TR')}
                </Row>
                <Row label="Kullanıcı ID">
                  <code className="text-xs text-text-muted">{data.id}</code>
                </Row>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <Link
                  to="/tickets"
                  className="text-primary font-semibold hover:underline text-sm"
                >
                  Biletlerimi Gör →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-text-muted">Kullanıcı bulunamadı</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-secondary font-medium">{children}</span>
    </div>
  );
}
