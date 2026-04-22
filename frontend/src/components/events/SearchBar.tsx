import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';

export function SearchBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (city.trim()) params.set('city', city.trim());
    navigate(`/events?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-xl shadow-xl p-4 md:p-5 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3"
    >
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">🔍</span>
        <input
          type="text"
          placeholder="Etkinlik veya sanatçı ara"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">📍</span>
        <input
          type="text"
          placeholder="Şehir (Istanbul, Ankara...)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <Button size="lg" type="submit" className="h-12">
        Ara
      </Button>
    </form>
  );
}
