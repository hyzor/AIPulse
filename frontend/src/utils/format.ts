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

/**
 * Format a timestamp as relative time (e.g., "2 min ago", "just now", "1 hour ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 10) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  return `${diffDays}d ago`;
}

/**
 * Get a color class based on data freshness
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Tailwind CSS color class
 */
export function getFreshnessColor(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'text-neon-green'; // Fresh: < 1 minute
  }
  if (diffMinutes < 5) {
    return 'text-green-400'; // Recent: 1-5 minutes
  }
  if (diffMinutes < 15) {
    return 'text-yellow-400'; // Stale: 5-15 minutes
  }
  return 'text-orange-400'; // Very stale: > 15 minutes
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

  // Convert to 24-hour format (handle case variations: PM, pm, P.M., etc.)
  const dp = dayPeriod.toUpperCase();
  if ((dp === 'PM' || dp === 'P.M.') && hour !== 12) {
    hour += 12;
  } else if ((dp === 'AM' || dp === 'A.M.') && hour === 12) {
    hour = 0;
  }

  const timeDecimal = hour + minute / 60;

  // Get day of week (handle both short and long forms)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayMap: Record<string, number> = {
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
    sun: 0, sunday: 0,
  };
  const dayOfWeek = dayMap[dayName] ?? dayMap[dayName.substring(0, 3)] ?? 0;

  // Check if it's a weekday (Mon-Fri) and within market hours
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWithinHours = timeDecimal >= hours.open && timeDecimal < hours.close;

  return isWeekday && isWithinHours;
}

/**
 * Check if a timestamp represents "today" relative to the exchange timezone.
 * A stock's "today" is defined by the exchange's calendar day (ET for US markets),
 * not the user's local timezone. This ensures a user in UTC+3 at 00:25 Tuesday
 * still sees Monday's data as "today" while the US is still on Monday evening.
 *
 * @param exchange - The exchange symbol
 * @param timestamp - Unix timestamp (in milliseconds or seconds)
 * @returns true if the timestamp is from today in the exchange's timezone
 */
export function isSameTradingDay(exchange: string, timestamp: number): boolean {
  const now = new Date();
  const time = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);

  const hours = EXCHANGE_HOURS[exchange];
  const timezone = hours?.timezone || 'America/New_York';

  // Compare dates in the exchange's timezone
  const nowParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(time);

  const getDateStr = (parts: Intl.DateTimeFormatPart[]) =>
    `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;

  return getDateStr(nowParts) === getDateStr(timeParts);
}

/**
 * Check if current time is before market opens today (pre-market hours)
 * Used to distinguish between pre-market (before 9:30 AM ET) and post-market (after 4:00 PM ET)
 *
 * @param exchange - The exchange symbol
 * @param now - Current date (defaults to now)
 * @returns true if we're before market open today
 */
export function isBeforeMarketOpen(exchange: string, now: Date = new Date()): boolean {
  const hours = EXCHANGE_HOURS[exchange];
  if (!hours) { return false; }

  // Get current time components in the exchange's timezone
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
  const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value || 'AM';

  let hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  // Convert to 24-hour format (handle case variations)
  const dp = dayPeriod.toUpperCase();
  if ((dp === 'PM' || dp === 'P.M.') && hour !== 12) {
    hour += 12;
  } else if ((dp === 'AM' || dp === 'A.M.') && hour === 12) {
    hour = 0;
  }

  const timeDecimal = hour + minute / 60;

  // Check if it's a weekday (handle both short and long forms)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayMap: Record<string, number> = {
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
    sun: 0, sunday: 0,
  };
  const dayOfWeek = dayMap[dayName] ?? dayMap[dayName.substring(0, 3)] ?? 0;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  // Before market open: before 9:30 AM ET on a weekday
  return isWeekday && timeDecimal < hours.open;
}

/**
 * Check if current time is after market close today (post-market hours)
 * Used to determine if today's trading session has ended
 *
 * @param exchange - The exchange symbol
 * @param now - Current date (defaults to now)
 * @returns true if we're after market close today
 */
export function isAfterMarketClose(exchange: string, now: Date = new Date()): boolean {
  const hours = EXCHANGE_HOURS[exchange];
  if (!hours) { return false; }

  // Get current time components in the exchange's timezone
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
  const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value || 'AM';

  let hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  // Convert to 24-hour format (handle case variations)
  const dp = dayPeriod.toUpperCase();
  if ((dp === 'PM' || dp === 'P.M.') && hour !== 12) {
    hour += 12;
  } else if ((dp === 'AM' || dp === 'A.M.') && hour === 12) {
    hour = 0;
  }

  const timeDecimal = hour + minute / 60;

  // Check if it's a weekday (handle both short and long forms)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: hours.timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayMap: Record<string, number> = {
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
    sun: 0, sunday: 0,
  };
  const dayOfWeek = dayMap[dayName] ?? dayMap[dayName.substring(0, 3)] ?? 0;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  // After market close: at or after 4:00 PM ET on a weekday
  return isWeekday && timeDecimal >= hours.close;
}

/**
 * Check if today is a weekend (Saturday or Sunday) in a given timezone
 */
export function isWeekend(timezone: string = 'America/New_York'): boolean {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  return dayName === 'Sat' || dayName === 'Sun';
}

/**
 * Get the most recent trading day (Friday if weekend, otherwise today)
 * Returns the date in the format YYYY-MM-DD for comparison
 */
export function getLastTradingDay(timezone: string = 'America/New_York'): string {
  const now = new Date();

  // Get current day of week in the target timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);

  // Calculate how many days to go back
  const dayMap: Record<string, number> = {
    Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 1, Sun: 2,
  };
  const daysToSubtract = dayMap[dayName] || 0;

  // Calculate the last trading day
  const lastTradingDay = new Date(now);
  lastTradingDay.setDate(lastTradingDay.getDate() - daysToSubtract);

  // Format as YYYY-MM-DD
  const year = lastTradingDay.getFullYear();
  const month = String(lastTradingDay.getMonth() + 1).padStart(2, '0');
  const day = String(lastTradingDay.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Check if a timestamp is from the most recent trading day
 */
export function isFromLastTradingDay(timestamp: number, timezone: string = 'America/New_York'): boolean {
  const time = new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);
  const lastTradingDay = getLastTradingDay(timezone);

  const timeYear = time.getFullYear();
  const timeMonth = String(time.getMonth() + 1).padStart(2, '0');
  const timeDay = String(time.getDate()).padStart(2, '0');
  const timeDateStr = `${timeYear}-${timeMonth}-${timeDay}`;

  return timeDateStr === lastTradingDay;
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
