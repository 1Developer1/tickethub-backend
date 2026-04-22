import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { CurrentPrice, SeatLayout, SeatSelection } from '@/types';
import { formatPrice } from '@/lib/format';

interface Props {
  seatLayout: SeatLayout;
  prices?: CurrentPrice[];
  selected: SeatSelection[];
  maxSeats?: number;
  onToggle: (seat: SeatSelection) => void;
}

export function SeatMap({ seatLayout, prices = [], selected, maxSeats = 6, onToggle }: Props) {
  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prices) m.set(p.sectionName, p.currentPriceInCents);
    return m;
  }, [prices]);

  const isSelected = (section: string, row: number, seat: number): boolean =>
    selected.some((s) => s.section === section && s.row === row && s.seat === seat);

  const canAddMore = selected.length < maxSeats;

  return (
    <div className="space-y-8">
      {/* Stage */}
      <div className="text-center">
        <div className="inline-block bg-secondary text-white text-xs font-semibold px-8 py-1.5 rounded-t-lg">
          SAHNE
        </div>
        <div className="h-2 bg-gradient-to-b from-secondary to-transparent" />
      </div>

      {Object.entries(seatLayout).map(([sectionName, section]) => {
        const price = priceMap.get(sectionName) ?? section.basePriceInCents;
        return (
          <div key={sectionName}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-secondary">{sectionName}</h3>
                <p className="text-xs text-text-muted">
                  {section.rows} sıra × {section.seatsPerRow} koltuk
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-primary">{formatPrice(price)}</div>
                <div className="text-xs text-text-muted">koltuk başı</div>
              </div>
            </div>

            <div className="bg-surface p-4 rounded-lg overflow-x-auto">
              <div className="inline-flex flex-col gap-1.5 mx-auto">
                {Array.from({ length: section.rows }).map((_, rowIdx) => {
                  const row = rowIdx + 1;
                  return (
                    <div key={row} className="flex items-center gap-1.5">
                      <span className="w-6 text-[10px] font-semibold text-text-muted text-right">
                        {row}
                      </span>
                      {Array.from({ length: section.seatsPerRow }).map((_, seatIdx) => {
                        const seat = seatIdx + 1;
                        const sel = isSelected(sectionName, row, seat);
                        const disabled = !sel && !canAddMore;
                        return (
                          <button
                            key={seat}
                            onClick={() => onToggle({ section: sectionName, row, seat })}
                            disabled={disabled}
                            title={`${sectionName} · Sıra ${row} · Koltuk ${seat}`}
                            className={cn(
                              'w-6 h-6 rounded text-[9px] font-semibold transition-all',
                              sel
                                ? 'bg-primary text-white scale-110 shadow-md'
                                : disabled
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                : 'bg-white border border-gray-300 text-secondary hover:border-primary hover:bg-primary/5',
                            )}
                          >
                            {seat}
                          </button>
                        );
                      })}
                      <span className="w-6 text-[10px] font-semibold text-text-muted">{row}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-6 pt-4 border-t border-gray-100">
        <LegendDot color="bg-white border border-gray-300" label="Müsait" />
        <LegendDot color="bg-primary" label="Seçili" />
        <LegendDot color="bg-gray-100" label="Dolu / Seçilemez" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span className={cn('w-4 h-4 rounded', color)} />
      <span>{label}</span>
    </div>
  );
}
