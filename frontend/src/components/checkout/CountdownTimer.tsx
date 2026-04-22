import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/cn';

interface Props {
  expiresAt: string;
  onExpire?: () => void;
}

export function CountdownTimer({ expiresAt, onExpire }: Props) {
  const { formatted, isUrgent, isExpired } = useCountdown(expiresAt, onExpire);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-lg transition-colors',
        isExpired
          ? 'bg-red-100 text-red-700'
          : isUrgent
          ? 'bg-amber-100 text-amber-700'
          : 'bg-primary/10 text-primary',
      )}
    >
      <span className="text-base">⏱</span>
      <span>{isExpired ? 'Süre doldu' : formatted}</span>
    </div>
  );
}
