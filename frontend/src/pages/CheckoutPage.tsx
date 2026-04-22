import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bookingsApi } from '@/api/bookings';
import { extractError } from '@/api/client';
import { CountdownTimer } from '@/components/checkout/CountdownTimer';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/format';

export function CheckoutPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();

  const { data: reservation, isLoading, error, refetch } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => bookingsApi.getById(reservationId!),
    enabled: Boolean(reservationId),
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingsApi.releaseHold(reservationId!),
    onSuccess: () => {
      toast.success('Rezervasyon iptal edildi');
      navigate('/events');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleExpired = () => {
    toast.error('Süre doldu. Lütfen tekrar deneyin.');
    refetch();
  };

  if (isLoading) {
    return (
      <div className="container-app py-8 max-w-2xl">
        <Skeleton className="h-8 w-1/3 mb-6" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="container-app py-16 text-center">
        <h2 className="text-xl font-semibold text-red-500 mb-2">Rezervasyon bulunamadı</h2>
        <Link to="/events" className="text-primary hover:underline">
          Etkinliklere dön
        </Link>
      </div>
    );
  }

  const isPending = reservation.status === 'PENDING';
  const isExpired = reservation.status === 'EXPIRED';
  const isConfirmed = reservation.status === 'CONFIRMED';

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8 max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-secondary">Ödeme Özeti</h1>
            <p className="text-sm text-text-muted mt-1">
              Koltuklarınız sizin için kilitlendi.
            </p>
          </div>
          {isPending && (
            <CountdownTimer expiresAt={reservation.expiresAt} onExpire={handleExpired} />
          )}
          {isExpired && <Badge tone="error">Süresi doldu</Badge>}
          {isConfirmed && <Badge tone="success">Onaylandı</Badge>}
        </div>

        {/* Reservation details */}
        <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-100 mb-4">
          <h3 className="font-bold text-secondary mb-4">Seçilen Koltuklar</h3>
          <div className="space-y-2">
            {reservation.seatHolds.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0"
              >
                <span className="text-secondary font-medium">
                  {s.section} · Sıra {s.row} · Koltuk {s.seat}
                </span>
                <span className="font-semibold">{formatPrice(s.priceInCents)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
            <span className="text-text-muted">Toplam</span>
            <span className="text-2xl font-bold text-primary">
              {formatPrice(reservation.totalPriceInCents)}
            </span>
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="space-y-3">
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(`/payment/${reservationId}`)}
            >
              Ödemeye Geç
            </Button>
            <Button
              fullWidth
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              loading={cancelMutation.isPending}
            >
              Rezervasyonu İptal Et
            </Button>
          </div>
        )}

        {isExpired && (
          <Link to={`/events/${reservation.eventId}`}>
            <Button fullWidth size="lg">Etkinliğe Dön</Button>
          </Link>
        )}

        {isConfirmed && (
          <Link to="/tickets">
            <Button fullWidth size="lg">Biletlerimi Gör</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
