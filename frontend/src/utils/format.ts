export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (value >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`;
  }
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

export function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getChangeColor(value: number): string {
  return value >= 0 ? 'text-neon-green' : 'text-neon-red';
}

export function getChangeBgColor(value: number): string {
  return value >= 0 ? 'bg-neon-green/10' : 'bg-neon-red/10';
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Exchange market hours in Eastern Time (ET) - 9:30 AM to 4:00 PM
// These times are in 24-hour format (9.5 = 9:30 AM, 16 = 4:00 PM)
// ET is UTC-5 (EST) or UTC-4 (EDT), but we check in ET timezone directly
const EXCHANGE_HOURS: Record<string, { open: number; close: number; timezone: string }> = {
  NASDAQ: { open: 9.5, close: 16, timezone: 'America/New_York' }, // 9:30 AM - 4:00 PM ET
  NYSE: { open: 9.5, close: 16, timezone: 'America/New_York' }, // 9:30 AM - 4:00 PM ET
};

/**
 * Get an appropriate label for the daily change based on user's local timezone
 *
 * Labels are shown from the user's perspective (their local timezone),
 * not the exchange's timezone.
 *
 * @param symbol - The stock symbol
 * @param timestamp - Unix timestamp of the quote (in milliseconds or seconds)
 * @returns A human-readable label like "today", "yesterday", "Fri", etc.
 */
export function getChangeLabel(symbol: string, timestamp: number): string {
  const now = new Date();

  // Normalize timestamp to milliseconds
  const quoteTime = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);

  // Determine exchange (default to US)
  const exchange = getExchangeForSymbol(symbol);

  // Compare dates in USER's LOCAL timezone (not exchange timezone)
  // This ensures labels make sense from the user's perspective
  const quoteDayLocal = new Date(quoteTime.getFullYear(), quoteTime.getMonth(), quoteTime.getDate());
  const todayDayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Check if market is currently open (uses exchange timezone for accuracy)
  const isMarketOpen = checkMarketOpen(exchange, now);

  // Calculate day difference in user's local timezone
  const dayDiffMs = todayDayLocal.getTime() - quoteDayLocal.getTime();
  const dayDiff = Math.floor(dayDiffMs / (24 * 60 * 60 * 1000));

  // Same day → "today" (from user's perspective)
  if (dayDiff === 0) {
    return isMarketOpen ? 'today' : 'today (closed)';
  }

  // Yesterday → "yesterday"
  if (dayDiff === 1) {
    return 'yesterday';
  }

  // Recent days → day name (from user's perspective)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (dayDiff <= 7) {
    return dayNames[quoteDayLocal.getDay()];
  }

  // Older data → show date in user's locale
  return quoteDayLocal.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Get the exchange for a given symbol (NASDAQ or NYSE)
 */
export function getExchangeForSymbol(symbol: string): string {
  const exchangeMap: Record<string, string> = {
    // NYSE
    TSM: 'NYSE',
    PLTR: 'NYSE',
    TSLA: 'NYSE',
  };

  // Default to NASDAQ for all other symbols
  return exchangeMap[symbol] || 'NASDAQ';
}

/**
 * Check if a market is currently open
 * Uses proper timezone conversion to check market hours in local exchange time
 */
export function checkMarketOpen(exchange: string, now: Date = new Date()): boolean {
  const hours = EXCHANGE_HOURS[exchange];
  if (!hours) { return false; }

  // Get current time components in the exchange's timezone using hour12: true
  // hour12: false can produce "24" as hour value in some browsers, causing NaN issues
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: hours.timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  };

  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);
  const timeParts = timeFormatter.formatToParts(now);

  const hourStr = timeParts.find((p) => p.type === 'hour')?.value || '0';
  const minuteStr = timeParts.find((p) => p.type === 'minute')?.value || '0';
  // dayPeriod type is 'dayPeriod' (camelCase) in Intl.DateTimeFormatPartTypesRegistry
  const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value || 'AM';

  let hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  // Convert to 24-hour format
  if (dayPeriod === 'PM' && hour !== 12) {
    hour += 12;
  } else if (dayPeriod === 'AM' && hour === 12) {
    hour = 0;
  }

  const timeDecimal = hour + minute / 60;

  // Get day of week
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const dayOfWeek = dayMap[dayName];

  // Check if it's a weekday (Mon-Fri) and within market hours
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWithinHours = timeDecimal >= hours.open && timeDecimal < hours.close;

  return isWeekday && isWithinHours;
}

/**
 * Check if a timestamp represents "today" from the user's perspective
 * Used to determine if data is from the user's current calendar day
 *
 * @param exchange - The exchange symbol
 * @param timestamp - Unix timestamp (in milliseconds or seconds)
 * @returns true if the timestamp is from today in user's local timezone
 */
export function isSameTradingDay(_exchange: string, timestamp: number): boolean {
  const now = new Date();
  const time = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);

  // Compare in USER's local timezone (not exchange timezone)
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeDay = new Date(time.getFullYear(), time.getMonth(), time.getDate());

  return nowDay.getTime() === timeDay.getTime();
}

/**
 * Get the start of the day in a specific timezone
 */
export function getDayInTimezone(date: Date, timezone: string): Date {
  // Create a date string in the target timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);

  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '0');
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '0');

  // Return a date object representing midnight in that timezone
  // We use UTC to avoid double-conversion issues
  return new Date(Date.UTC(year, month - 1, day));
}
