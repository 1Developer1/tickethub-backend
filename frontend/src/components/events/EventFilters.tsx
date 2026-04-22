import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import type { EventCategory } from '@/types';
import { CATEGORY_LABELS } from '@/lib/format';

export function EventFilters() {
  const [params, setParams] = useSearchParams();

  const category = params.get('category') as EventCategory | null;
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const dateFrom = params.get('dateFrom') ?? '';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    setParams(next);
  };

  const clear = () => setParams({});

  const hasAny = params.toString().length > 0;

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 space-y-4">
      <div>
        <label className="block text-sm font-medium text-secondary mb-1.5">Arama</label>
        <input
          type="text"
          placeholder="Metallica, Hamlet..."
          defaultValue={q}
          onBlur={(e) => update('q', e.target.value.trim())}
          className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-secondary mb-1.5">Şehir</label>
        <input
          type="text"
          placeholder="İstanbul"
          defaultValue={city}
          onBlur={(e) => update('city', e.target.value.trim())}
          className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-secondary mb-1.5">Başlangıç Tarihi</label>
        <input
          type="date"
          defaultValue={dateFrom ? dateFrom.slice(0, 10) : ''}
          onChange={(e) =>
            update('dateFrom', e.target.value ? new Date(e.target.value).toISOString() : '')
          }
          className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-secondary mb-1.5">Kategori</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => update('category', category === c ? '' : c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                category === c
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-secondary border-gray-300 hover:border-primary'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {hasAny && (
        <Button variant="outline" fullWidth onClick={clear}>
          Filtreleri Temizle
        </Button>
      )}
    </div>
  );
}
