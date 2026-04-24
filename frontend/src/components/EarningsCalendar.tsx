import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';

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

function getUrgencyBadge(daysUntil: number): string {
  if (daysUntil === 0) {return 'bg-neon-red/20 text-neon-red border-neon-red/40';}
  if (daysUntil <= 3) {return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';}
  return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
}

function calculateSurprise(event: EarningsEvent): { surprisePercent: number | null; isBeat: boolean } {
  if (event.epsActual === null || event.epsEstimate === null) {
    return { surprisePercent: null, isBeat: false };
  }
  const surprise = ((event.epsActual - event.epsEstimate) / Math.abs(event.epsEstimate)) * 100;
  return { surprisePercent: surprise, isBeat: surprise >= 0 };
}

export function EarningsCalendar({ events }: EarningsCalendarProps) {
  // Split into upcoming (no actuals) and reported (has actuals)
  const upcoming = events
    .filter((e) => e.epsActual === null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const reported = events
    .filter((e) => e.epsActual !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Most recent first
    .slice(0, 3); // Only show last 3 reported in sidebar

  const hasContent = upcoming.length > 0 || reported.length > 0;

  if (!hasContent) {
    // Show loading skeleton while earnings data is being fetched
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-600 bg-dark-800/80">
          <Calendar className="w-3.5 h-3.5 text-neon-blue" />
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Upcoming Earnings</h3>
          <span className="text-xs text-gray-500">Loading...</span>
        </div>
        <div className="grid grid-cols-2 gap-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="flex items-center justify-between px-2 py-1.5 rounded-md bg-dark-700/20 border border-dark-700/30 animate-pulse"
            >
              <div className="w-8 h-3 bg-dark-600/50 rounded" />
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-3 bg-dark-600/50 rounded" />
                <div className="w-8 h-3 bg-dark-600/50 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
      {/* Upcoming Section */}
      {upcoming.length > 0 && (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-600 bg-dark-800/80">
            <Calendar className="w-3.5 h-3.5 text-neon-blue" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Upcoming Earnings</h3>
            <span className="text-xs text-gray-500">({upcoming.length})</span>
          </div>

          {/* 2-column grid for sidebar */}
          <div className="grid grid-cols-2 gap-1 p-2">
            {upcoming.map((event) => {
              const daysUntil = getDaysUntil(event.date);
              const displayName = STOCK_DISPLAY_NAMES[event.symbol] || event.symbol;

              return (
                <Tooltip
                  key={`upcoming-${event.symbol}-${event.date}`}
                  content={
                    <div className="space-y-1">
                      <p className="font-semibold">{displayName} ({event.symbol})</p>
                      <p className="text-xs text-gray-400">
                        {new Date(`${event.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                      <p className="text-xs">
                        {event.hour === 'bmo' ? 'Before Market Open' : event.hour === 'amc' ? 'After Market Close' : 'Time TBD'}
                      </p>
                      {event.epsEstimate !== null && (
                        <p className="text-xs">Est. EPS: ${event.epsEstimate.toFixed(2)}</p>
                      )}
                      {event.revenueEstimate !== null && (
                        <p className="text-xs">Est. Revenue: ${(event.revenueEstimate / 1e9).toFixed(1)}B</p>
                      )}
                    </div>
                  }
                  position="left"
                >
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-md cursor-help transition-colors hover:bg-dark-700/50 bg-dark-700/30 border border-dark-700/50">
                    <span className="text-[11px] font-medium text-gray-300 shrink-0 mr-2">{event.symbol}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getUrgencyBadge(daysUntil)}`}>
                        {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? '1d' : `${daysUntil}d`}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {formatEarningsDate(event.date)}
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
          {upcoming.length > 0 && <div className="border-t border-dark-600" />}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-600 bg-dark-800/80">
            <TrendingUp className="w-3.5 h-3.5 text-neon-green" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Recent</h3>
            <span className="text-xs text-gray-500">({reported.length})</span>
          </div>

          <div className="divide-y divide-dark-700/50">
            {reported.map((event) => {
              const displayName = STOCK_DISPLAY_NAMES[event.symbol] || event.symbol;
              const daysSince = getDaysSince(event.date);
              const eps = calculateSurprise(event);

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
                    </div>
                  }
                  position="left"
                >
                  <div className="flex items-center justify-between px-3 py-2 cursor-help transition-colors hover:bg-dark-700/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-gray-300 shrink-0">{event.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {eps.surprisePercent !== null && (
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${eps.isBeat ? 'text-neon-green' : 'text-neon-red'}`}>
                          {eps.isBeat ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {Math.abs(eps.surprisePercent).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500">
                        {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
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
