import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.locale('tr');

/** Format cents as Turkish Lira with 2 decimals. 15000 → "₺150,00" */
export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const amount = cents / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format ISO date as "15 Mayıs 2026, Cumartesi" */
export function formatDateLong(iso: string): string {
  return dayjs(iso).format('DD MMMM YYYY, dddd');
}

/** Format ISO date as "15 May 2026" */
export function formatDateShort(iso: string): string {
  return dayjs(iso).format('DD MMM YYYY');
}

/** Format time as "20:00" */
export function formatTime(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

/** Relative time like "2 gün sonra" */
export function formatRelative(iso: string): string {
  return dayjs(iso).fromNow();
}

/** Turkish category labels */
export const CATEGORY_LABELS: Record<string, string> = {
  CONCERT: 'Konser',
  THEATER: 'Tiyatro',
  SPORTS: 'Spor',
  FESTIVAL: 'Festival',
  OTHER: 'Diğer',
};

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
