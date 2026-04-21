import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';

import { Tooltip } from './Tooltip';
import { STOCK_DISPLAY_NAMES } from '../types';

import type { EarningsEvent } from '../types';

interface EarningsBadgeProps {
  symbol: string;
  event?: EarningsEvent;
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

function calculateSurprise(event: EarningsEvent): { surprisePercent: number | null; isBeat: boolean } {
  if (event.epsActual === null || event.epsEstimate === null) {
    return { surprisePercent: null, isBeat: false };
  }
  const surprise = ((event.epsActual - event.epsEstimate) / Math.abs(event.epsEstimate)) * 100;
  return { surprisePercent: surprise, isBeat: surprise >= 0 };
}

export function EarningsBadge({ symbol, event }: EarningsBadgeProps) {
  if (!event) {
    return null;
  }

  const displayName = STOCK_DISPLAY_NAMES[symbol] || symbol;

  // Case 1: Already reported - show Beat/Miss badge for 7 days after
  if (event.epsActual !== null) {
    const daysSince = getDaysSince(event.date);

    // Only show for 7 days after reporting
    if (daysSince > 7) {
      return null;
    }

    const eps = calculateSurprise(event);

    return (
      <Tooltip
        content={
          <div className="space-y-1.5">
            <p className="font-semibold">{displayName} reported earnings</p>
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
              </div>
            )}
          </div>
        }
        position="top"
      >
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-help ${
            eps.isBeat
              ? 'bg-neon-green/15 text-neon-green border-neon-green/30'
              : 'bg-neon-red/15 text-neon-red border-neon-red/30'
          }`}
        >
          {eps.isBeat ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {eps.isBeat ? 'Beat' : 'Miss'} {eps.surprisePercent !== null ? `${Math.abs(eps.surprisePercent).toFixed(0)}%` : ''}
        </span>
      </Tooltip>
    );
  }

  // Case 2: Upcoming earnings
  const daysUntil = getDaysUntil(event.date);

  // Only show badge if earnings is within 14 days
  if (daysUntil < 0 || daysUntil > 14) {
    return null;
  }

  const hourLabel = event.hour === 'bmo' ? 'Before Market Open' : event.hour === 'amc' ? 'After Market Close' : 'Time TBD';

  // Determine urgency styling
  let badgeClass = '';
  let label = '';

  if (daysUntil === 0) {
    badgeClass = 'bg-neon-red/20 text-neon-red border-neon-red/40';
    label = 'TODAY';
  } else if (daysUntil <= 3) {
    badgeClass = 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    label = `ER ${daysUntil}d`;
  } else {
    badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/25';
    label = `${new Date(`${event.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <p className="font-semibold">{displayName} reports earnings</p>
          <p className="text-xs text-gray-400">
            {new Date(`${event.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-xs">{hourLabel}</p>
          {event.epsEstimate !== null && (
            <p className="text-xs">Est. EPS: ${event.epsEstimate.toFixed(2)}</p>
          )}
          {event.epsEstimate === null && event.revenueEstimate === null && (
            <p className="text-xs text-gray-500">No analyst estimates available</p>
          )}
        </div>
      }
      position="top"
    >
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-help ${badgeClass}`}
      >
        <Calendar className="w-3 h-3" />
        {label}
      </span>
    </Tooltip>
  );
}
