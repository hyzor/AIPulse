/**
 * Market hours utility for backend
 *
 * Determines when US stock markets (NASDAQ/NYSE) are open.
 * Used to skip unnecessary API calls when markets are closed,
 * preserving Finnhub API quota.
 */

// US Market holidays 2024-2026 (NYSE/NASDAQ observed holidays)
// Source: https://www.nyse.com/markets/hours-calendars
const MARKET_HOLIDAYS = new Set([
  // 2024
  '2024-01-01', // New Year's Day
  '2024-01-15', // Martin Luther King Jr. Day
  '2024-02-19', // Presidents' Day
  '2024-03-29', // Good Friday
  '2024-05-27', // Memorial Day
  '2024-06-19', // Juneteenth
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // Martin Luther King Jr. Day
  '2025-02-17', // Presidents' Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth (observed June 19, 2026 is a Friday)
  '2026-07-03', // Independence Day (observed, July 4 is Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

// Market hours in Eastern Time (ET)
// Regular hours: 9:30 AM - 4:00 PM ET
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

/**
 * Format a date as YYYY-MM-DD string in Eastern Time
 */
function formatDateInET(date: Date): string {
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = etFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Get the day of week (0-6) in Eastern Time
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
function getDayOfWeekInET(date: Date): number {
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });

  const dayName = etFormatter.format(date);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return dayMap[dayName] ?? 0;
}

/**
 * Get current time components in Eastern Time
 */
function getTimeInET(date: Date): { hour: number; minute: number; timeDecimal: number } {
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = etFormatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

  return {
    hour,
    minute,
    timeDecimal: hour + minute / 60,
  };
}

/**
 * Check if the US stock market is currently open
 *
 * Market is considered OPEN when:
 * - It's a weekday (Monday-Friday)
 * - It's not a market holiday
 * - Time is between 9:30 AM - 4:00 PM ET
 *
 * @param now Optional date to check (defaults to current time)
 * @returns true if market is open, false otherwise
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  // Check if it's a weekday
  const dayOfWeek = getDayOfWeekInET(now);
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Weekend
  }

  // Check if it's a holiday
  const dateStr = formatDateInET(now);
  if (MARKET_HOLIDAYS.has(dateStr)) {
    return false; // Holiday
  }

  // Check market hours (9:30 AM - 4:00 PM ET)
  const { timeDecimal } = getTimeInET(now);
  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60; // 9.5
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60; // 16.0

  return timeDecimal >= openDecimal && timeDecimal < closeDecimal;
}

/**
 * Check if today is a trading day (weekday that's not a holiday)
 *
 * @param now Optional date to check (defaults to current time)
 * @returns true if today is a trading day, false otherwise
 */
export function isTradingDay(now: Date = new Date()): boolean {
  // Check if it's a weekday
  const dayOfWeek = getDayOfWeekInET(now);
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Weekend
  }

  // Check if it's a holiday
  const dateStr = formatDateInET(now);
  if (MARKET_HOLIDAYS.has(dateStr)) {
    return false; // Holiday
  }

  return true;
}

/**
 * Get detailed market status information
 */
export interface MarketStatus {
  isOpen: boolean;
  isTradingDay: boolean;
  isHoliday: boolean;
  isWeekend: boolean;
  currentTimeET: string;
  nextOpenTime?: Date;
  message: string;
}

/**
 * Get the start and end of a trading day in Eastern Time
 * Returns UTC timestamps for the trading day bounds (9:30 AM - 4:00 PM ET)
 *
 * This properly handles DST transitions by using Intl.DateTimeFormat to
 * convert between ET local time and UTC.
 *
 * @param date The date to get trading hours for (defaults to current date)
 * @returns Object with from (market open) and to (market close) in UTC
 */
export function getTradingDayBounds(date: Date = new Date()): { from: Date; to: Date } {
  // Get the date components in Eastern Time
  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = etDateFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  // Create date strings for market open (9:30 AM) and close (4:00 PM) in ET
  // We construct ISO strings and parse them to get proper UTC timestamps
  const marketOpenET = `${year}-${month}-${day}T09:30:00`;
  const marketCloseET = `${year}-${month}-${day}T16:00:00`;

  // Use Intl.DateTimeFormat to convert ET times to UTC
  // We create dates by parsing the ET datetime and calculating the offset
  const createUTCFromET = (etDateStr: string): Date => {
    // Parse the ET date
    const [datePart, timePart] = etDateStr.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = timePart.split(':').map(Number);

    // Create a date object and format it to see what time it is in UTC
    const testDate = new Date(Date.UTC(y, m - 1, d, h, min));

    // Get the ET representation of this UTC time to calculate offset
    const etTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    // Try different UTC hours to find when ET matches our target
    // Binary search for the correct UTC time that corresponds to our ET target
    let utcGuess = testDate.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let attempts = 0; attempts < 10; attempts++) {
      const guessDate = new Date(utcGuess);
      const etParts = etTimeFormatter.formatToParts(guessDate);
      const etHour = parseInt(etParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
      const etMinute = parseInt(etParts.find((p) => p.type === 'minute')?.value ?? '0', 10);

      const targetMinutes = h * 60 + min;
      const etMinutes = etHour * 60 + etMinute;

      if (etMinutes === targetMinutes) {
        // Check if the day matches too
        const etDayFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const dayParts = etDayFormatter.formatToParts(guessDate);
        const etYear = dayParts.find((p) => p.type === 'year')?.value;
        const etMonth = dayParts.find((p) => p.type === 'month')?.value;
        const etDay = dayParts.find((p) => p.type === 'day')?.value;

        if (etYear === year && etMonth === month && etDay === day) {
          return guessDate;
        }
      }

      // Adjust guess
      const diffMinutes = targetMinutes - etMinutes;
      utcGuess += diffMinutes * 60 * 1000;

      // Handle day boundaries
      if (diffMinutes > 720) {
        utcGuess -= dayMs;
      } else if (diffMinutes < -720) {
        utcGuess += dayMs;
      }
    }

    // Fallback: return the test date if we couldn't converge
    return testDate;
  };

  return {
    from: createUTCFromET(marketOpenET),
    to: createUTCFromET(marketCloseET),
  };
}

/**
 * Get the previous trading day bounds (for when market is closed)
 * Returns UTC timestamps for the previous trading day's market hours
 *
 * @param date The reference date (defaults to current date)
 * @returns Object with from (market open) and to (market close) in UTC
 */
export function getPreviousTradingDayBounds(date: Date = new Date()): { from: Date; to: Date } {
  // Start from yesterday and find the most recent trading day
  let checkDate = new Date(date);

  for (let i = 1; i < 10; i++) {
    checkDate = new Date(date.getTime() - i * 24 * 60 * 60 * 1000);
    if (isTradingDay(checkDate)) {
      return getTradingDayBounds(checkDate);
    }
  }

  // Fallback to 1 day ago
  return getTradingDayBounds(new Date(date.getTime() - 24 * 60 * 60 * 1000));
}

/**
 * Get detailed market status
 */
export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const dayOfWeek = getDayOfWeekInET(now);
  const dateStr = formatDateInET(now);
  const { hour, minute } = getTimeInET(now);

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = MARKET_HOLIDAYS.has(dateStr);
  const tradingDay = !isWeekend && !isHoliday;

  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60;
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60;
  const timeDecimal = hour + minute / 60;
  const open = tradingDay && timeDecimal >= openDecimal && timeDecimal < closeDecimal;

  const currentTimeET = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;

  let message: string;
  if (isWeekend) {
    message = 'Market closed - Weekend';
  } else if (isHoliday) {
    message = 'Market closed - Holiday';
  } else if (!open) {
    if (timeDecimal < openDecimal) {
      message = 'Market closed - Opens at 9:30 AM ET';
    } else {
      message = 'Market closed - Closed at 4:00 PM ET';
    }
  } else {
    message = 'Market open';
  }

  return {
    isOpen: open,
    isTradingDay: tradingDay,
    isHoliday,
    isWeekend,
    currentTimeET,
    message,
  };
}
