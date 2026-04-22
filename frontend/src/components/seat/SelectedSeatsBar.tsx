import type { SeatSelection, CurrentPrice, SeatLayout } from '@/types';
import { formatPrice } from '@/lib/format';
import { Button } from '@/components/ui/Button';

interface Props {
  selected: SeatSelection[];
  seatLayout: SeatLayout;
  prices?: CurrentPrice[];
  onRemove: (seat: SeatSelection) => void;
  onContinue: () => void;
  continuing?: boolean;
}

export function SelectedSeatsBar({
  selected,
  seatLayout,
  prices = [],
  onRemove,
  onContinue,
  continuing,
}: Props) {
  const priceFor = (section: string): number => {
    const current = prices.find((p) => p.sectionName === section);
    if (current) return current.currentPriceInCents;
    return seatLayout[section]?.basePriceInCents ?? 0;
  };

  const total = selected.reduce((sum, s) => sum + priceFor(s.section), 0);

  if (selected.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-gray-300 rounded-xl p-6 text-center">
        <div className="text-3xl mb-2">🎟️</div>
        <p className="text-text-muted text-sm">
          Devam etmek için yukarıdaki koltuk planından koltuk seç.
        </p>
      </div>
    );
  }

  return (
    <div className="sticky bottom-4 bg-white rounded-xl shadow-xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-secondary">Seçili Koltuklar ({selected.length})</h3>
        <div className="text-right">
          <div className="text-xs text-text-muted">Toplam</div>
          <div className="text-xl font-bold text-primary">{formatPrice(total)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 max-h-24 overflow-y-auto">
        {selected.map((s) => (
          <button
            key={`${s.section}-${s.row}-${s.seat}`}
            onClick={() => onRemove(s)}
            className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
            title="Kaldırmak için tıkla"
          >
            <span>
              {s.section} · Sıra {s.row} · Koltuk {s.seat}
            </span>
            <span className="text-primary/60">✕</span>
          </button>
        ))}
      </div>

      <Button fullWidth size="lg" onClick={onContinue} loading={continuing}>
        Devam Et ({formatPrice(total)})
      </Button>
    </div>
  );
}
