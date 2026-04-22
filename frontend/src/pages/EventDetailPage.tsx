import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { eventsApi } from '@/api/events';
import { venuesApi } from '@/api/venues';
import { pricingApi } from '@/api/pricing';
import { bookingsApi } from '@/api/bookings';
import { useAuthStore } from '@/stores/authStore';
import { extractError } from '@/api/client';
import { SeatMap } from '@/components/seat/SeatMap';
import { SelectedSeatsBar } from '@/components/seat/SelectedSeatsBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { formatCategory, formatDateLong, formatTime } from '@/lib/format';
import type { SeatSelection } from '@/types';

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));

  const [selected, setSelected] = useState<SeatSelection[]>([]);

  const eventQuery = useQuery({
    queryKey: ['event', id],
    queryFn: () => eventsApi.getById(id!),
    enabled: Boolean(id),
  });

  const venueQuery = useQuery({
    queryKey: ['venue', eventQuery.data?.venueId],
    queryFn: () => venuesApi.getById(eventQuery.data!.venueId),
    enabled: Boolean(eventQuery.data?.venueId),
  });

  const pricesQuery = useQuery({
    queryKey: ['prices', id],
    queryFn: () => pricingApi.getCurrent(id!),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });

  const holdMutation = useMutation({
    mutationFn: () => bookingsApi.hold({ eventId: id!, seats: selected }),
    onSuccess: (reservation) => {
      toast.success('Koltuklar 10 dakikalığına rezerve edildi');
      navigate(`/checkout/${reservation.id}`);
    },
    onError: (err) => {
      toast.error(extractError(err));
    },
  });

  const toggle = (seat: SeatSelection) => {
    setSelected((prev) => {
      const exists = prev.find(
        (s) => s.section === seat.section && s.row === seat.row && s.seat === seat.seat,
      );
      if (exists) {
        return prev.filter((s) => s !== exists);
      }
      return [...prev, seat];
    });
  };

  const remove = (seat: SeatSelection) => {
    setSelected((prev) =>
      prev.filter(
        (s) => !(s.section === seat.section && s.row === seat.row && s.seat === seat.seat),
      ),
    );
  };

  const handleContinue = () => {
    if (!isAuthed) {
      toast('Devam etmek için giriş yap', { icon: '🔒' });
      navigate('/auth/login', { state: { from: `/events/${id}` } });
      return;
    }
    holdMutation.mutate();
  };

  if (eventQuery.isLoading) {
    return (
      <div className="container-app py-8 space-y-6">
        <Skeleton className="aspect-[21/9] rounded-xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (eventQuery.error || !eventQuery.data) {
    return (
      <div className="container-app py-16 text-center">
        <h2 className="text-xl font-semibold text-red-500">Etkinlik bulunamadı</h2>
      </div>
    );
  }

  const event = eventQuery.data;

  return (
    <div className="bg-surface min-h-screen">
      {/* Poster hero */}
      <div className="bg-gradient-to-br from-secondary via-secondary-light to-primary-dark">
        <div className="container-app py-8 md:py-12 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Badge tone="accent">{formatCategory(event.category)}</Badge>
            <Badge tone="success">Bilet Satışta</Badge>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-3">{event.name}</h1>
          {event.description && (
            <p className="text-white/80 max-w-3xl mb-6">{event.description}</p>
          )}

          <div className="flex flex-wrap gap-6 text-sm">
            <InfoItem icon="📅" label="Tarih">
              {formatDateLong(event.startsAt)}
            </InfoItem>
            <InfoItem icon="🕐" label="Saat">
              {formatTime(event.startsAt)}
            </InfoItem>
            {venueQuery.data && (
              <InfoItem icon="📍" label="Mekan">
                {venueQuery.data.name} · {venueQuery.data.city}
              </InfoItem>
            )}
          </div>
        </div>
      </div>

      {/* Seat selection */}
      <div className="container-app py-8">
        <div className="bg-white rounded-2xl p-4 md:p-8 shadow-card">
          <h2 className="text-xl font-bold text-secondary mb-1">Koltuk Seçimi</h2>
          <p className="text-sm text-text-muted mb-6">
            En fazla 6 koltuk seçebilirsin. Koltuk seçtikten sonra 10 dk içinde ödeme yapman gerekir.
          </p>

          {venueQuery.isLoading && <Skeleton className="h-96" />}

          {venueQuery.data && (
            <SeatMap
              seatLayout={venueQuery.data.seatLayout}
              prices={pricesQuery.data}
              selected={selected}
              onToggle={toggle}
            />
          )}
        </div>
      </div>

      {/* Sticky selected seats bar */}
      {venueQuery.data && selected.length > 0 && (
        <div className="container-app pb-8 sticky bottom-0">
          <SelectedSeatsBar
            selected={selected}
            seatLayout={venueQuery.data.seatLayout}
            prices={pricesQuery.data}
            onRemove={remove}
            onContinue={handleContinue}
            continuing={holdMutation.isPending}
          />
        </div>
      )}
    </div>
  );
}

function InfoItem({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-white/60 mb-0.5">
        {icon} {label}
      </div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}
