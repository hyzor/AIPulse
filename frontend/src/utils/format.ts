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
 * Get an appropriate label for the daily change based on market hours
 *
 * If markets are currently open and the quote is from today → "today"
 * If markets are closed and the quote is from the last trading day → "last session" or day name
 *
 * @param symbol - The stock symbol
 * @param timestamp - Unix timestamp of the quote (in milliseconds or seconds)
 * @returns A human-readable label like "today", "last session", "Fri", "Thu", etc.
 */
export function getChangeLabel(symbol: string, timestamp: number): string {
  const now = new Date();

  // Normalize timestamp to milliseconds
  const quoteTime = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);

  // Determine exchange (default to US)
  const exchange = getExchangeForSymbol(symbol);
  const hours = EXCHANGE_HOURS[exchange];

  // Check if the quote is from "today" (same calendar day in the exchange's timezone)
  const quoteDay = getDayInTimezone(quoteTime, hours.timezone);
  const todayDay = getDayInTimezone(now, hours.timezone);

  // Check if market is currently open
  const isMarketOpen = checkMarketOpen(exchange, now);

  // If quote is from today and market is open → "today"
  if (quoteDay.getTime() === todayDay.getTime() && isMarketOpen) {
    return 'today';
  }

  // If quote is from today but market is closed → "last session"
  if (quoteDay.getTime() === todayDay.getTime()) {
    return 'last session';
  }

  // If quote is from a previous day → show day name
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayDiff = Math.floor((todayDay.getTime() - quoteDay.getTime()) / (24 * 60 * 60 * 1000));

  // For recent days, show the day name
  if (dayDiff <= 7) {
    return dayNames[quoteDay.getDay()];
  }

  // For older data, show the date
  return quoteDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
 * Check if a timestamp represents "today" in a given exchange's timezone
 * Used to determine if data is from the current trading session
 */
export function isSameTradingDay(exchange: string, timestamp: number): boolean {
  const hours = EXCHANGE_HOURS[exchange];
  if (!hours) { return false; }

  const now = new Date();
  const time = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);

  // Get the date in the exchange's timezone for both "now" and the quote time
  const nowDay = getDayInTimezone(now, hours.timezone);
  const timeDay = getDayInTimezone(time, hours.timezone);

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
