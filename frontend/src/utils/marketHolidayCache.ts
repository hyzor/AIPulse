import { stockService } from '../services/stockService';

import type { TodayStatus } from '../types';

let cachedStatus: TodayStatus | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
type Listener = (status: TodayStatus) => void;
let listeners: Listener[] = [];

function notifyListeners(status: TodayStatus): void {
  listeners.forEach((cb) => cb(status));
}

export function subscribe(callback: Listener): () => void {
  listeners.push(callback);
  if (cachedStatus) {
    callback(cachedStatus);
  }
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

async function fetchAndCache(): Promise<void> {
  try {
    const status = await stockService.getTodayStatus();
    cachedStatus = status;
    notifyListeners(status);
  } catch {
    const fallback: TodayStatus = { isHoliday: false, holidayName: null, isTradingDay: true };
    cachedStatus = fallback;
    notifyListeners(fallback);
  }
}

fetchAndCache();

if (refreshTimer === null) {
  refreshTimer = setInterval(fetchAndCache, 60 * 60 * 1000);
}

export function isMarketHoliday(): boolean {
  return cachedStatus?.isHoliday ?? false;
}
