import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCategory, formatDateShort, formatTime } from '@/lib/format';
import type { Event } from '@/types';

interface Props {
  event: Event;
}

export function EventCard({ event }: Props) {
  return (
    <Link to={`/events/${event.id}`}>
      <Card hoverable className="h-full flex flex-col">
        <div className="aspect-[16/9] bg-gradient-to-br from-secondary to-primary relative">
          {event.posterUrl ? (
            <img
              src={event.posterUrl}
              alt={event.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl opacity-40">
              {categoryEmoji(event.category)}
            </div>
          )}
          <div className="absolute top-3 left-3">
            <Badge tone="primary">{formatCategory(event.category)}</Badge>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-secondary line-clamp-2 min-h-[3rem]">
            {event.name}
          </h3>

          <div className="mt-3 space-y-1.5 text-sm text-text-muted">
            <div className="flex items-center gap-2">
              <span>📅</span>
              <span>
                {formatDateShort(event.startsAt)} · {formatTime(event.startsAt)}
              </span>
            </div>
            {event.venue && (
              <div className="flex items-center gap-2">
                <span>📍</span>
                <span className="line-clamp-1">
                  {event.venue.name}, {event.venue.city}
                </span>
              </div>
            )}
          </div>

          <div className="mt-auto pt-4 flex items-center justify-between">
            <span className="text-xs text-text-muted">Biletler</span>
            <span className="text-primary font-bold text-sm">Detayları Gör →</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    CONCERT: '🎤',
    THEATER: '🎭',
    SPORTS: '⚽',
    FESTIVAL: '🎪',
    OTHER: '🎟️',
  };
  return map[category] ?? '🎟️';
}
