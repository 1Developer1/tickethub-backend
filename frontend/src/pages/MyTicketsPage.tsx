import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '@/api/tickets';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

export function MyTicketsPage() {
  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ['tickets'],
    queryFn: ticketsApi.myTickets,
  });

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8">
        <h1 className="text-3xl font-bold text-secondary mb-1">Biletlerim</h1>
        <p className="text-text-muted mb-6">Tüm aktif ve geçmiş biletlerin burada.</p>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500">Biletler yüklenemedi</div>
        )}

        {tickets && tickets.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <div className="text-5xl mb-3">🎫</div>
            <p className="font-semibold text-secondary">Henüz biletin yok</p>
            <p className="text-sm text-text-muted mt-1 mb-4">
              Harika etkinliklere göz at, bilet al.
            </p>
            <Link
              to="/events"
              className="inline-block text-primary font-semibold hover:underline"
            >
              Etkinlikleri Keşfet →
            </Link>
          </div>
        )}

        {tickets && tickets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tickets.map((ticket) => (
              <Link key={ticket.id} to={`/tickets/${ticket.id}`}>
                <Card hoverable className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Bilet No</div>
                      <div className="font-mono font-semibold text-secondary text-sm">
                        {ticket.id.slice(0, 8)}...
                      </div>
                    </div>
                    <TicketStatusBadge status={ticket.status} />
                  </div>

                  <div className="text-xs text-text-muted">
                    Oluşturulma: {new Date(ticket.createdAt).toLocaleDateString('tr-TR')}
                  </div>

                  <div className="mt-3 text-primary font-semibold text-sm">
                    QR Kodu Gör →
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketStatusBadge({ status }: { status: string }) {
  if (status === 'VALID') return <Badge tone="success">Geçerli</Badge>;
  if (status === 'USED') return <Badge tone="neutral">Kullanıldı</Badge>;
  return <Badge tone="error">İptal</Badge>;
}
