import { Calendar, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { useState } from 'react';

import { Tooltip } from './Tooltip';
import { STOCK_DISPLAY_NAMES } from '../types';

import type { EarningsEvent } from '../types';

interface EarningsCalendarProps {
  events: EarningsEvent[];
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${dateStr}T00:00:00`);
  const diffMs = eventDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getDaysSince(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${dateStr}T00:00:00`);
  const diffMs = today.getTime() - eventDate.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatEarningsDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const daysUntil = getDaysUntil(dateStr);

  if (daysUntil === 0) {return 'Today';}
  if (daysUntil === 1) {return 'Tomorrow';}

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatReportedDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const daysSince = getDaysSince(dateStr);

  if (daysSince === 0) {return 'Today';}
  if (daysSince === 1) {return 'Yesterday';}

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getUrgencyClass(daysUntil: number): string {
  if (daysUntil === 0) {return 'text-neon-red';}
  if (daysUntil <= 3) {return 'text-yellow-400';}
  return 'text-gray-400';
}

function getUrgencyBg(daysUntil: number): string {
  if (daysUntil === 0) {return 'bg-neon-red/10 border-neon-red/30';}
  if (daysUntil <= 3) {return 'bg-yellow-500/10 border-yellow-500/30';}
  return 'bg-dark-700 border-dark-600';
}

function calculateSurprise(event: EarningsEvent): { surprisePercent: number | null; isBeat: boolean } {
  if (event.epsActual === null || event.epsEstimate === null) {
    return { surprisePercent: null, isBeat: false };
  }
  const surprise = ((event.epsActual - event.epsEstimate) / Math.abs(event.epsEstimate)) * 100;
  return { surprisePercent: surprise, isBeat: surprise >= 0 };
}

function calculateRevenueSurprise(event: EarningsEvent): { surprisePercent: number | null; isBeat: boolean } {
  if (event.revenueActual === null || event.revenueEstimate === null) {
    return { surprisePercent: null, isBeat: false };
  }
  const surprise = ((event.revenueActual - event.revenueEstimate) / Math.abs(event.revenueEstimate)) * 100;
  return { surprisePercent: surprise, isBeat: surprise >= 0 };
}

export function EarningsCalendar({ events }: EarningsCalendarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Split into upcoming (no actuals) and reported (has actuals)
  const upcoming = events
    .filter((e) => e.epsActual === null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const reported = events
    .filter((e) => e.epsActual !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Most recent first
    .slice(0, 5); // Only show last 5 reported

  const hasContent = upcoming.length > 0 || reported.length > 0;

  if (!hasContent) {
    return null;
  }

  const displayedEvents = isExpanded ? upcoming : upcoming.slice(0, 4);
  const hasMore = upcoming.length > 4;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neon-blue" />
              <h3 className="text-sm font-semibold text-white">Upcoming Earnings</h3>
              <span className="text-xs text-gray-500">({upcoming.length} in next 30 days)</span>
            </div>
            {hasMore && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-neon-blue hover:text-neon-blue/80 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show all
                  </>
                )}
              </button>
            )}
          </div>

          {/* Upcoming list */}
          <div className="divide-y divide-dark-600">
            {displayedEvents.map((event) => {
              const daysUntil = getDaysUntil(event.date);
              const displayName = STOCK_DISPLAY_NAMES[event.symbol] || event.symbol;
              const hourLabel = event.hour === 'bmo' ? 'Before Open' : event.hour === 'amc' ? 'After Close' : 'Time TBD';

              return (
                <Tooltip
                  key={`upcoming-${event.symbol}-${event.date}`}
                  content={
                    <div className="space-y-1">
                      <p className="font-semibold">{displayName} ({event.symbol})</p>
                      <p className="text-xs text-gray-400">{new Date(`${event.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                      <p className="text-xs">{hourLabel}</p>
                      {event.epsEstimate !== null && (
                        <p className="text-xs">Est. EPS: ${event.epsEstimate.toFixed(2)}</p>
                      )}
                      {event.revenueEstimate !== null && (
                        <p className="text-xs">Est. Revenue: ${(event.revenueEstimate / 1e9).toFixed(1)}B</p>
                      )}
                      {event.epsEstimate === null && event.revenueEstimate === null && (
                        <p className="text-xs text-gray-500">No analyst estimates available</p>
                      )}
                    </div>
                  }
                  position="top"
                >
                  <div
                    className={`flex items-center justify-between px-4 py-2.5 cursor-help transition-colors hover:bg-dark-700 ${getUrgencyBg(daysUntil)}`}
                  >
                    {/* Left: Symbol + Name + Estimate */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-white shrink-0">{event.symbol}</span>
                      <span className="text-xs text-gray-500 hidden sm:inline truncate">{displayName}</span>
                      {event.epsEstimate !== null && (
                        <span className="text-xs text-gray-500 hidden md:inline shrink-0">
                          Est. ${event.epsEstimate.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {/* Right: Countdown + Date + Time */}
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className={`text-xs font-medium ${getUrgencyClass(daysUntil)}`}>
                        {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatEarningsDate(event.date)}
                      </span>
                      <span className="text-xs text-gray-500">
                        <span className="sm:hidden">{event.hour === 'bmo' ? 'BMO' : event.hour === 'amc' ? 'AMC' : ''}</span>
                        <span className="hidden sm:inline">{event.hour === 'bmo' ? 'Before Open' : event.hour === 'amc' ? 'After Close' : ''}</span>
                      </span>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {/* Recent Results Section */}
      {reported.length > 0 && (
        <>
          {upcoming.length > 0 && <div className="border-t-2 border-dark-500" />}
          <div className="px-4 py-3 border-b border-dark-600 bg-dark-800/80">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-neon-green" />
              <h3 className="text-sm font-semibold text-white">Recent Results</h3>
              <span className="text-xs text-gray-500">(last {reported.length} reported)</span>
            </div>
          </div>

          <div className="divide-y divide-dark-600">
            {reported.map((event) => {
              const displayName = STOCK_DISPLAY_NAMES[event.symbol] || event.symbol;
              const daysSince = getDaysSince(event.date);
              const eps = calculateSurprise(event);
              const rev = calculateRevenueSurprise(event);

              return (
                <Tooltip
                  key={`reported-${event.symbol}-${event.date}`}
                  content={
                    <div className="space-y-1.5">
                      <p className="font-semibold">{displayName} ({event.symbol})</p>
                      <p className="text-xs text-gray-400">
                        {new Date(`${event.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                      {event.epsEstimate !== null && event.epsActual !== null && (
                        <div className="text-xs">
                          <p>EPS: Est ${event.epsEstimate.toFixed(2)} vs Actual ${event.epsActual.toFixed(2)}</p>
                          {eps.surprisePercent !== null && (
                            <p className={eps.isBeat ? 'text-neon-green' : 'text-neon-red'}>
                              {eps.isBeat ? 'Beat' : 'Miss'} by {Math.abs(eps.surprisePercent).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}
                      {event.revenueEstimate !== null && event.revenueActual !== null && (
                        <div className="text-xs">
                          <p>Revenue: Est ${(event.revenueEstimate / 1e9).toFixed(1)}B vs Actual ${(event.revenueActual / 1e9).toFixed(1)}B</p>
                          {rev.surprisePercent !== null && (
                            <p className={rev.isBeat ? 'text-neon-green' : 'text-neon-red'}>
                              {rev.isBeat ? 'Beat' : 'Miss'} by {Math.abs(rev.surprisePercent).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  }
                  position="top"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 cursor-help transition-colors hover:bg-dark-700 bg-dark-800/50">
                    {/* Left: Symbol + Name + Actual */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-white shrink-0">{event.symbol}</span>
                      <span className="text-xs text-gray-500 hidden sm:inline truncate">{displayName}</span>
                      {event.epsActual !== null && (
                        <span className="text-xs text-neon-green font-medium shrink-0">
                          ${event.epsActual.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {/* Right: Surprise + Date */}
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {eps.surprisePercent !== null && (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${eps.isBeat ? 'text-neon-green' : 'text-neon-red'}`}>
                          {eps.isBeat ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {eps.isBeat ? 'Beat' : 'Miss'} {Math.abs(eps.surprisePercent).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatReportedDate(event.date)}
                      </span>
                      <span className="text-xs text-gray-600">
                        {daysSince === 0 ? 'Today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`}
                      </span>
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
