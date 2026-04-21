import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

import { checkMarketOpen } from '../utils/format';

interface MarketStatusContextType {
  isMarketOpen: boolean;
}

const MarketStatusContext = createContext<MarketStatusContextType | undefined>(undefined);

const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

/**
 * Convert a target ET date/time to a UTC timestamp.
 * Tries both EDT (UTC-4) and EST (UTC-5) offsets and verifies with Intl.DateTimeFormat.
 */
function getTimestampForET(year: number, month: number, day: number, hour: number, minute: number): number {
  const dateStr = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

  for (const offset of [-4, -5]) {
    const offsetStr = offset < 0
      ? `-${String(Math.abs(offset)).padStart(2, '0')}:00`
      : `+${String(offset).padStart(2, '0')}:00`;
    const candidate = new Date(`${dateStr}${offsetStr}`);

    if (Number.isNaN(candidate.getTime())) { continue; }

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const timeParts = timeFormatter.formatToParts(candidate);
    const etHour = parseInt(timeParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const etMinute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10);

    if (etHour === hour && etMinute === minute) {
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const dayParts = dayFormatter.formatToParts(candidate);
      const etYear = parseInt(dayParts.find((p) => p.type === 'year')?.value || '0', 10);
      const etMonth = parseInt(dayParts.find((p) => p.type === 'month')?.value || '0', 10);
      const etDay = parseInt(dayParts.find((p) => p.type === 'day')?.value || '0', 10);

      if (etYear === year && etMonth === month && etDay === day) {
        return candidate.getTime();
      }
    }
  }

  // Fallback to EDT assumption
  return new Date(`${dateStr}-04:00`).getTime();
}

/**
 * Calculate the exact timestamp (ms since epoch) of the next market open or close transition.
 */
function getNextTransitionTimestamp(): number | null {
  const now = new Date();
  const timezone = 'America/New_York';

  // Current ET date/time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const timeDecimal = hour + minute / 60;
  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60;
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60;

  // Day of week in ET
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const dayOfWeek = dayMap[dayName] ?? 0;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const currentlyOpen = isWeekday && timeDecimal >= openDecimal && timeDecimal < closeDecimal;

  let targetYear = year;
  let targetMonth = month;
  let targetDay = day;
  let targetHour: number;
  let targetMinute: number;

  if (currentlyOpen) {
    // Next transition: market close today
    targetHour = MARKET_CLOSE_HOUR;
    targetMinute = MARKET_CLOSE_MINUTE;
  } else {
    if (isWeekday && timeDecimal < openDecimal) {
      // Before open today
      targetHour = MARKET_OPEN_HOUR;
      targetMinute = MARKET_OPEN_MINUTE;
    } else {
      // After close or weekend — find next weekday
      let daysToAdd = 1;
      if (dayOfWeek === 5) {
        daysToAdd = 3; // Friday -> Monday
      } else if (dayOfWeek === 6) {
        daysToAdd = 2; // Saturday -> Monday
      }
      // Sunday (0) -> +1 to Monday, weekdays after close -> +1 to next day

      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + daysToAdd);

      const nextDateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const nextParts = nextDateFormatter.formatToParts(nextDate);
      targetYear = parseInt(nextParts.find((p) => p.type === 'year')?.value || '0', 10);
      targetMonth = parseInt(nextParts.find((p) => p.type === 'month')?.value || '0', 10);
      targetDay = parseInt(nextParts.find((p) => p.type === 'day')?.value || '0', 10);

      targetHour = MARKET_OPEN_HOUR;
      targetMinute = MARKET_OPEN_MINUTE;
    }
  }

  return getTimestampForET(targetYear, targetMonth, targetDay, targetHour, targetMinute);
}

export function MarketStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => checkMarketOpen('NASDAQ'));
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleNext = useCallback(() => {
    const nextTs = getNextTransitionTimestamp();
    if (!nextTs) { return; }

    const delay = nextTs - Date.now();

    // If we somehow missed the transition (e.g., tab was backgrounded), update now and reschedule
    if (delay <= 0) {
      setIsOpen(checkMarketOpen('NASDAQ'));
      // Use a micro-delay to avoid infinite synchronous loops
      timeoutRef.current = setTimeout(() => {
        scheduleNext();
      }, 0);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setIsOpen(checkMarketOpen('NASDAQ'));
      scheduleNext();
    }, delay);
  }, []);

  useEffect(() => {
    scheduleNext();

    // Safety net: when tab becomes visible, re-check and reschedule
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsOpen(checkMarketOpen('NASDAQ'));
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        scheduleNext();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [scheduleNext]);

  return (
    <MarketStatusContext.Provider value={{ isMarketOpen: isOpen }}>
      {children}
    </MarketStatusContext.Provider>
  );
}

export function useMarketStatus(): MarketStatusContextType {
  const context = useContext(MarketStatusContext);
  if (context === undefined) {
    throw new Error('useMarketStatus must be used within a MarketStatusProvider');
  }
  return context;
}
