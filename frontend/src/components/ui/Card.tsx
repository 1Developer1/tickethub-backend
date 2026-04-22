import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({ children, hoverable = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden',
        hoverable && 'transition-all hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
