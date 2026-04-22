import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '@/api/events';
import { CategoryTabs } from '@/components/layout/CategoryTabs';
import { SearchBar } from '@/components/events/SearchBar';
import { EventCard } from '@/components/events/EventCard';
import { Skeleton } from '@/components/ui/Skeleton';

export function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['events', { limit: 12 }],
    queryFn: () => eventsApi.list({ limit: 12 }),
  });

  return (
    <div className="bg-surface">
      {/* Hero */}
      <section className="bg-gradient-to-br from-secondary via-secondary-light to-primary-dark text-white">
        <div className="container-app py-12 md:py-20 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4">
            Unutulmaz Deneyimler, <br className="hidden sm:block" />
            <span className="text-accent">Bir Tık Uzağınızda</span>
          </h1>
          <p className="text-base md:text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Türkiye'nin en büyük konserlerine, tiyatrolarına ve spor müsabakalarına bilet alın. Güvenli, anlık, komisyonsuz.
          </p>
          <div className="max-w-3xl mx-auto">
            <SearchBar />
          </div>
        </div>
      </section>

      {/* Category tabs */}
      <section className="container-app py-8">
        <CategoryTabs />
      </section>

      {/* Featured events */}
      <section className="container-app pb-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-secondary">Öne Çıkan Etkinlikler</h2>
            <p className="text-text-muted text-sm mt-1">Popüler konser ve etkinliklerden seçmeler</p>
          </div>
        </div>

        {error && (
          <div className="text-center py-12 text-red-500">
            Etkinlikler yüklenemedi. Backend çalışıyor mu?
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[16/9] rounded-xl" />
                <Skeleton className="h-5 mt-3 w-3/4" />
                <Skeleton className="h-4 mt-2 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {data && data.data.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            Henüz yayınlanmış etkinlik yok.
          </div>
        )}

        {data && data.data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data.data.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* Trust section */}
      <section className="bg-white border-t border-gray-100">
        <div className="container-app py-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <TrustItem icon="🎟️" title="Orijinal Biletler" text="Tüm biletler organizatörden direkt, sahte bilet derdi yok." />
          <TrustItem icon="🔒" title="Güvenli Ödeme" text="Ödemeler SSL ile şifrelenir, kart bilgisi saklanmaz." />
          <TrustItem icon="📱" title="Anında E-Bilet" text="QR kodlu biletin email'ine saniyeler içinde gelir." />
        </div>
      </section>
    </div>
  );
}

function TrustItem({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div>
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-secondary mb-1">{title}</h3>
      <p className="text-sm text-text-muted">{text}</p>
    </div>
  );
}
