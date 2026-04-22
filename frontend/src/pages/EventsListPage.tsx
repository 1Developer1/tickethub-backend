import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { eventsApi, type EventFilters as EF } from '@/api/events';
import { CategoryTabs } from '@/components/layout/CategoryTabs';
import { EventCard } from '@/components/events/EventCard';
import { EventFilters } from '@/components/events/EventFilters';
import { Skeleton } from '@/components/ui/Skeleton';
import type { EventCategory } from '@/types';

export function EventsListPage() {
  const [params] = useSearchParams();

  const filters = useMemo<EF>(() => {
    const f: EF = { limit: 24 };
    const q = params.get('q');
    const city = params.get('city');
    const category = params.get('category');
    const dateFrom = params.get('dateFrom');
    const dateTo = params.get('dateTo');
    const cursor = params.get('cursor');
    if (q) f.q = q;
    if (city) f.city = city;
    if (category) f.category = category as EventCategory;
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    if (cursor) f.cursor = cursor;
    return f;
  }, [params]);

  const activeCategory = (params.get('category') as EventCategory) || 'ALL';

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', filters],
    queryFn: () => eventsApi.list(filters),
  });

  return (
    <div className="bg-surface min-h-screen">
      <div className="container-app py-8">
        <h1 className="text-3xl font-bold text-secondary mb-1">Etkinlikler</h1>
        <p className="text-text-muted mb-6">Size uygun etkinliği bulun.</p>

        <div className="mb-8">
          <CategoryTabs active={activeCategory} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <EventFilters />
          </aside>

          <main>
            {error && (
              <div className="text-center py-12 text-red-500">
                Etkinlikler yüklenemedi.
              </div>
            )}

            {isLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="aspect-[16/9] rounded-xl" />
                    <Skeleton className="h-5 mt-3 w-3/4" />
                    <Skeleton className="h-4 mt-2 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {data && data.data.length === 0 && (
              <div className="text-center py-16 text-text-muted bg-white rounded-xl border border-gray-100">
                <div className="text-5xl mb-3">🔍</div>
                <p className="font-semibold text-secondary">Sonuç bulunamadı</p>
                <p className="text-sm mt-1">Filtreleri değiştirmeyi deneyin.</p>
              </div>
            )}

            {data && data.data.length > 0 && (
              <>
                <div className="text-sm text-text-muted mb-4">
                  {data.data.length} etkinlik gösteriliyor
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {data.data.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
