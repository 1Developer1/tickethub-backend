import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/15 text-accent-dark',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-700',
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
