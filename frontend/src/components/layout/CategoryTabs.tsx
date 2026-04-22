import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import type { EventCategory } from '@/types';

interface CategoryTab {
  key: EventCategory | 'ALL';
  label: string;
  icon: string;
}

const tabs: CategoryTab[] = [
  { key: 'ALL', label: 'Tümü', icon: '🎟️' },
  { key: 'CONCERT', label: 'Konser', icon: '🎤' },
  { key: 'THEATER', label: 'Tiyatro', icon: '🎭' },
  { key: 'SPORTS', label: 'Spor', icon: '⚽' },
  { key: 'FESTIVAL', label: 'Festival', icon: '🎪' },
];

interface Props {
  active?: EventCategory | 'ALL';
}

export function CategoryTabs({ active = 'ALL' }: Props) {
  return (
    <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const href = tab.key === 'ALL' ? '/events' : `/events?category=${tab.key}`;
        return (
          <Link
            key={tab.key}
            to={href}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm whitespace-nowrap transition-all',
              isActive
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-secondary border border-gray-200 hover:border-primary hover:text-primary',
            )}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
