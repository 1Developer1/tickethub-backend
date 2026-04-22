import { useEffect, useState } from 'react';

/**
 * Countdown to a target Date. Returns formatted mm:ss string + seconds remaining.
 * Calls onExpire once when hitting zero.
 */
export function useCountdown(target: Date | string | null, onExpire?: () => void) {
  const targetMs = target ? new Date(target).getTime() : null;

  const [remaining, setRemaining] = useState<number>(() =>
    targetMs ? Math.max(0, targetMs - Date.now()) : 0,
  );

  useEffect(() => {
    if (!targetMs) {
      setRemaining(0);
      return;
    }

    const update = () => {
      const ms = Math.max(0, targetMs - Date.now());
      setRemaining(ms);
      if (ms === 0 && onExpire) onExpire();
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetMs, onExpire]);

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    formatted,
    remainingMs: remaining,
    totalSeconds,
    isExpired: remaining === 0,
    isUrgent: remaining > 0 && totalSeconds < 120, // last 2 minutes
  };
}
