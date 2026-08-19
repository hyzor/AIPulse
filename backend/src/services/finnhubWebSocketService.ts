/**
 * Finnhub WebSocket Service
 *
 * Streams real-time trades from Finnhub's free WebSocket (wss://ws.finnhub.io)
 * and feeds them into the existing candle buffer + latest-quote pipeline
 * (Redis + TimescaleDB), reusing the 'websocket' source already supported
 * end-to-end. While connected, the REST background collector pauses, so the
 * 60 calls/min budget is essentially freed (quotes arrive via WS for free).
 *
 * Toggle: USE_FINNHUB_WS=true (default off)
 * One connection per API key; free tier supports up to 50 symbols.
 */
import WebSocket from 'ws';

import { TRACKED_STOCKS } from '../constants';
import { candleBufferService } from './candleBufferService';
import { finnhubService } from './finnhubService';
import { isMarketOpen } from '../utils/marketHours';

import type { FinnhubTrade, FinnhubTradeMessage } from '../types';

interface SessionStats {
  previousClose: number;
  open: number;
  high: number;
  low: number;
  baseVolume: number; // Cumulative day volume from the REST seed
  tradeVolume: number; // Trade volume accumulated via WebSocket since the seed
  seedDate: string; // YYYY-MM-DD (UTC) of the last seed
  lastNotifiedMinute: number; // Last minute bucket that fired a historicalUpdate
}

const WS_URL = 'wss://ws.finnhub.io';
const DEFAULT_PERSIST_INTERVAL_MS = 2000; // Throttle latest-quote DB writes per symbol
const DEFAULT_WATCHDOG_INTERVAL_MS = 30000;
const DEFAULT_STALE_THRESHOLD_MS = 90000; // Force reconnect if silent this long during market hours
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000; // Exponential backoff cap
const DEFAULT_RESUBSCRIBE_INTERVAL_MS = 120000; // Re-send subscribes (heals dropped per-symbol subs)
const FALLBACK_COOLDOWN_MS = 60000; // Min interval between REST fallback fetches per symbol
const SEED_RETRY_COOLDOWN_MS = 60000; // Min interval between re-seed attempts for symbols missing session stats

class FinnhubWebSocketService {
  private ws: WebSocket | null = null;
  private readonly enabled: boolean;
  private connected = false;
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private marketWasOpen = false;
  private sessionStats = new Map<string, SessionStats>();
  private lastQuotePersist = new Map<string, number>();
  private onMinuteUpdate: ((symbol: string) => void) | null = null;

  private readonly persistIntervalMs: number;
  private readonly watchdogIntervalMs: number;
  private readonly staleThresholdMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly resubscribeIntervalMs: number;

  // Per-symbol state for feed health
  private lastBarMinute = new Map<string, number>(); // Last minute with a WS bar per symbol
  private lastFallbackFetch = new Map<string, number>(); // Cooldown for REST fallback per symbol
  private lastSeedRetryAt = 0; // Timestamp of the last re-seed attempt for symbols missing session stats

  constructor() {
    this.enabled = process.env.USE_FINNHUB_WS === 'true';
    this.persistIntervalMs = parseInt(process.env.WS_QUOTE_PERSIST_INTERVAL_MS || String(DEFAULT_PERSIST_INTERVAL_MS), 10);
    this.watchdogIntervalMs = parseInt(process.env.WS_WATCHDOG_INTERVAL_MS || String(DEFAULT_WATCHDOG_INTERVAL_MS), 10);
    this.staleThresholdMs = parseInt(process.env.WS_STALE_THRESHOLD_MS || String(DEFAULT_STALE_THRESHOLD_MS), 10);
    this.reconnectMaxDelayMs = parseInt(process.env.WS_RECONNECT_MAX_DELAY_MS || String(DEFAULT_RECONNECT_MAX_DELAY_MS), 10);
    this.resubscribeIntervalMs = parseInt(process.env.WS_RESUBSCRIBE_INTERVAL_MS || String(DEFAULT_RESUBSCRIBE_INTERVAL_MS), 10);

    console.log(`[FinnhubWS] ${this.enabled ? 'Enabled' : 'Disabled'} (USE_FINNHUB_WS=${this.enabled})`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastMessageAgeSeconds(): number | null {
    if (this.lastMessageAt === 0) {
      return null;
    }
    return Math.round((Date.now() - this.lastMessageAt) / 1000);
  }

  getStats() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAgeSeconds: this.getLastMessageAgeSeconds(),
      symbolsTracked: TRACKED_STOCKS.length,
    };
  }

  /**
   * Register a callback fired once per minute per symbol when a new candle
   * minute starts. server.ts wires this to the frontend chart-refresh broadcast.
   */
  setOnMinuteUpdate(callback: (symbol: string) => void): void {
    this.onMinuteUpdate = callback;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Seed per-symbol daily stats (prev close, day OHLC, cumulative volume) with
    // one REST call each. This is the only REST usage while WS mode is active
    // (~15 calls per session; getQuote serves cache when the market is closed).
    await this.seedSessionStats();

    // Baseline for the closed->open transition detector (avoid an immediate
    // redundant re-seed on the first watchdog tick)
    this.marketWasOpen = isMarketOpen();

    this.connect();

    // Watchdog: force-reconnect silent drops (Finnhub is known to close without
    // a close frame), re-seed daily stats when the date rolls over or the
    // market transitions closed -> open, re-send subscribes to heal dropped
    // per-symbol subscriptions, and REST-fallback symbols gone quiet for a
    // couple of minutes during market hours.
    let lastResubscribeAt = 0;
    this.watchdogTimer = setInterval(() => {
      if (
        this.connected
        && isMarketOpen()
        && this.lastMessageAt > 0
        && Date.now() - this.lastMessageAt > this.staleThresholdMs
      ) {
        console.warn(`[FinnhubWS] No message for ${Math.round(this.staleThresholdMs / 1000)}s during market hours - forcing reconnect`);
        this.ws?.terminate();
      }

      const now = Date.now();
      if (this.connected && now - lastResubscribeAt >= this.resubscribeIntervalMs) {
        lastResubscribeAt = now;
        console.log(`[FinnhubWS] Re-sending subscriptions for ${TRACKED_STOCKS.length} symbols (feed health)`);
        for (const symbol of TRACKED_STOCKS) {
          this.ws?.send(JSON.stringify({ type: 'subscribe', symbol }));
        }
      }

      // REST fallback for symbols with no WS bar for the current minute during
      // market hours (dropped subscription or genuinely thin tape). Bounded by
      // a 60s cooldown per symbol.
      if (this.connected && isMarketOpen()) {
        const currentMinute = Math.floor(now / 60000);
        for (const symbol of TRACKED_STOCKS) {
          const lastBar = this.lastBarMinute.get(symbol) ?? 0;
          const lastFallback = this.lastFallbackFetch.get(symbol) ?? 0;
          if (lastBar < currentMinute && now - lastFallback >= FALLBACK_COOLDOWN_MS) {
            this.lastFallbackFetch.set(symbol, now);
            this.fetchFallbackQuote(symbol).catch((error) => {
              console.warn(`[FinnhubWS] Fallback fetch failed for ${symbol}:`, error instanceof Error ? error.message : error);
            });
          }
        }
      }

      // Re-seed symbols that failed their initial seed (e.g. a transient API
      // error). Without a sessionStats entry their trades are silently dropped
      // by handleTrade, and the REST collector is paused while connected, so
      // they'd otherwise stay dark until the next market transition. Bounded
      // by a cooldown to avoid hammering the API.
      if (this.connected) {
        const missingSymbols = TRACKED_STOCKS.filter((s) => !this.sessionStats.has(s));
        if (missingSymbols.length > 0 && now - this.lastSeedRetryAt >= SEED_RETRY_COOLDOWN_MS) {
          this.lastSeedRetryAt = now;
          console.warn(`[FinnhubWS] Re-seeding ${missingSymbols.length} symbols missing session stats: ${missingSymbols.join(', ')}`);
          this.seedSessionStats(missingSymbols).catch((error) => {
            console.error('[FinnhubWS] Re-seed of missing symbols failed:', error instanceof Error ? error.message : error);
          });
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const dayChanged = [...this.sessionStats.values()].some((s) => s.seedDate !== today);
      const marketOpened = isMarketOpen() && !this.marketWasOpen;
      this.marketWasOpen = isMarketOpen();

      if (dayChanged || marketOpened) {
        console.log(`[FinnhubWS] Re-seeding session stats (dayChanged=${dayChanged}, marketOpened=${marketOpened})`);
        this.seedSessionStats().catch((error) => {
          console.error('[FinnhubWS] Re-seed failed:', error instanceof Error ? error.message : error);
        });
      }
    }, this.watchdogIntervalMs);
  }

  stop(): void {
    this.manualClose = true;
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    console.log('[FinnhubWS] Stopped');
  }

  // ---------------------------------------------------------------------------
  // Session seeding (daily stats baseline)
  // ---------------------------------------------------------------------------

  private async seedSessionStats(symbols: readonly string[] = TRACKED_STOCKS): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    let seeded = 0;

    for (const symbol of symbols) {
      try {
        // skipCache=true ensures a live snapshot; the market-hours logic inside
        // getQuote still serves cache when the market is closed (no API burn).
        const quote = await finnhubService.getQuote(symbol, true);
        if (quote) {
          this.sessionStats.set(symbol, {
            previousClose: quote.previousClose,
            open: quote.openPrice,
            high: quote.highPrice,
            low: quote.lowPrice,
            baseVolume: quote.volume,
            tradeVolume: 0,
            seedDate: today,
            lastNotifiedMinute: 0,
          });
          seeded++;
        }
      } catch (error) {
        console.warn(`[FinnhubWS] Seed failed for ${symbol}:`, error instanceof Error ? error.message : error);
      }

      // Gentle pacing - stays well within the 60 calls/min budget
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`[FinnhubWS] Seeded session stats for ${seeded}/${symbols.length} symbols`);
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  private connect(): void {
    if (!this.enabled || this.manualClose) {
      return;
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error('[FinnhubWS] FINNHUB_API_KEY not configured - WebSocket feed disabled');
      return;
    }

    console.log(`[FinnhubWS] Connecting to ${WS_URL}...`);
    const ws = new WebSocket(`${WS_URL}/?token=${apiKey}`);

    ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      console.log(`[FinnhubWS] Connected. Subscribing to ${TRACKED_STOCKS.length} symbols...`);

      for (const symbol of TRACKED_STOCKS) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
    });

    ws.on('message', (data) => this.handleMessage(data.toString()));

    ws.on('close', (code, reason) => {
      this.connected = false;
      console.log(`[FinnhubWS] Connection closed (code=${code}${reason ? ` reason=${reason.toString()}` : ''})`);
      this.scheduleReconnect();
    });

    ws.on('error', (error) => {
      console.error(`[FinnhubWS] Socket error: ${error.message}`);
    });

    this.ws = ws;
  }

  private scheduleReconnect(): void {
    if (this.manualClose || !this.enabled) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.reconnectMaxDelayMs);
    console.log(`[FinnhubWS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  /**
   * REST fallback for a symbol whose WS feed went quiet during market hours
   * (dropped subscription or genuinely thin tape). Samples one quote like the
   * old background collector, keeping the 1m series continuous.
   */
  private async fetchFallbackQuote(symbol: string): Promise<void> {
    const stats = this.sessionStats.get(symbol);
    if (!stats) {
      return;
    }

    const quote = await finnhubService.getQuote(symbol, true);
    if (!quote) {
      return;
    }

    const now = Date.now();
    stats.high = Math.max(stats.high, quote.currentPrice);
    stats.low = Math.min(stats.low, quote.currentPrice);
    this.lastBarMinute.set(symbol, Math.floor(now / 60000));

    // Volume is always 0 from /quote (Finnhub doesn't provide it there)
    candleBufferService.updatePrice(symbol, quote.currentPrice, 0, now);

    candleBufferService.updateLatestQuote(
      symbol,
      {
        currentPrice: quote.currentPrice,
        change: quote.change,
        changePercent: quote.changePercent,
        high: stats.high,
        low: stats.low,
        open: stats.open,
        previousClose: stats.previousClose,
        volume: stats.baseVolume + stats.tradeVolume,
      },
      'api',
      now,
    ).catch((error) => {
      console.error(`[FinnhubWS] Fallback quote persist failed for ${symbol}:`, error);
    });

    console.log(`[FinnhubWS] REST fallback sampled ${symbol} at ${quote.currentPrice} (WS quiet)`);
  }

  private handleMessage(raw: string): void {
    this.lastMessageAt = Date.now();

    try {
      const message = JSON.parse(raw) as FinnhubTradeMessage;

      if (message.type === 'ping') {
        this.ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (message.type === 'trade' && Array.isArray(message.data)) {
        for (const trade of message.data) {
          this.handleTrade(trade);
        }
      }
    } catch (error) {
      console.warn('[FinnhubWS] Failed to parse message:', error instanceof Error ? error.message : error);
    }
  }

  private handleTrade(trade: FinnhubTrade): void {
    const stats = this.sessionStats.get(trade.s);
    if (!stats) {
      return; // Untracked symbol - ignore
    }

    stats.tradeVolume += trade.v;
    stats.high = Math.max(stats.high, trade.p);
    stats.low = Math.min(stats.low, trade.p);

    const minuteBucket = Math.floor(trade.t / 60000);
    this.lastBarMinute.set(trade.s, minuteBucket);

    // Feed the minute-candle buffer (true trade aggregation; every storage layer
    // dedupes by (symbol, minute), so partial flushes are safe)
    candleBufferService.updatePrice(trade.s, trade.p, trade.v, trade.t, 'websocket');

    // Notify chart subscribers once per minute per symbol (frontend refetch)
    if (minuteBucket !== stats.lastNotifiedMinute) {
      stats.lastNotifiedMinute = minuteBucket;
      this.onMinuteUpdate?.(trade.s);
    }

    // Throttle persisted latest-quote (Redis + TimescaleDB) to bound write volume
    const now = Date.now();
    const lastPersist = this.lastQuotePersist.get(trade.s) ?? 0;
    if (now - lastPersist >= this.persistIntervalMs) {
      this.lastQuotePersist.set(trade.s, now);

      const change = trade.p - stats.previousClose;
      const changePercent = stats.previousClose !== 0 ? (change / stats.previousClose) * 100 : 0;

      candleBufferService.updateLatestQuote(
        trade.s,
        {
          currentPrice: trade.p,
          change,
          changePercent,
          high: stats.high,
          low: stats.low,
          open: stats.open,
          previousClose: stats.previousClose,
          volume: stats.baseVolume + stats.tradeVolume,
        },
        'websocket',
        trade.t,
      ).catch((error) => {
        console.error(`[FinnhubWS] Failed to persist quote for ${trade.s}:`, error);
      });
    }
  }
}

export const finnhubWebSocketService = new FinnhubWebSocketService();
