import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import cors from 'cors';
import dotenv from 'dotenv';

// Now import everything else
import express from 'express';
import { WebSocketServer } from 'ws';

import { TRACKED_STOCKS } from './constants';
import stockRoutes from './routes/stockRoutes';
import { candleBufferService } from './services/candleBufferService';
import { databaseService } from './services/databaseService';
import { finnhubService } from './services/finnhubService';
import { redisService } from './services/redisService';
import { isMarketOpen, getMarketStatus } from './utils/marketHours';

import type { WebSocketMessage, StockQuote, HealthStatus } from './types';
import type WebSocket from 'ws';

// Get the directory of this file to reliably find project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root FIRST before any other imports
// This works for both local dev (tsx from backend/) and Docker (compiled to dist/)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Debug: Log environment status (mask API key for security)
const apiKey = process.env.FINNHUB_API_KEY;
console.log('[Config] Environment loaded from:', envPath);
console.log('[Config] FINNHUB_API_KEY present:', apiKey ? 'Yes' : 'No');
console.log('[Config] FINNHUB_API_KEY length:', apiKey ? apiKey.length : 0);
if (apiKey) {
  console.log('[Config] FINNHUB_API_KEY preview:', `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
}

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Stale data threshold - refresh if data is older than this (seconds)
// Default: 300s (5min) for production
// For development: 60s (1min) or 30s for frequent redeploys
const STALE_DATA_THRESHOLD = parseInt(process.env.STALE_DATA_THRESHOLD_SECONDS || '300', 10);
console.log(`[Config] Stale data threshold: ${STALE_DATA_THRESHOLD}s`);

// Rate limit optimized refresh intervals (Finnhub free tier: 60 calls/min)
// Default: 180s (3min) = 20 calls/min for 12 stocks - very conservative for dev
const AUTO_REFRESH_INTERVAL = parseInt(process.env.AUTO_REFRESH_INTERVAL_MS || '180000', 10);

// Minimum calls to reserve for user-initiated requests (historical data, etc.)
const RATE_LIMIT_BUFFER = parseInt(process.env.RATE_LIMIT_BUFFER || '20', 10);

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());

// API Routes (must be BEFORE static files)
app.use('/api', stockRoutes);

// Health check endpoint with full system status
app.get('/api/health', async (_req, res) => {
  const dbHealth = await databaseService.getHealthStatus();
  const redisHealth = { connected: redisService.getConnectionStatus(), latency: 0 };

  if (redisHealth.connected) {
    const start = Date.now();
    await redisService.ping();
    redisHealth.latency = Date.now() - start;
  }

  const dbStats = await databaseService.getStats();

  const status: HealthStatus = {
    status: dbHealth.connected && redisHealth.connected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      redis: redisHealth,
      finnhub: {
        configured: finnhubService.isConfigured(),
        rateLimitRemaining: finnhubService.getRateLimitStatus().callsRemaining,
      },
    },
    dataStats: dbStats,
  };

  res.json(status);
});

// API info endpoint (moved from root to /api)
app.get('/api', (_req, res) => {
  res.json({
    name: 'AIPulse API',
    version: '1.0.0',
    description: 'AI Stock Monitoring API with Persistent Cache',
    endpoints: {
      stocks: '/api/stocks',
      stockDetail: '/api/stocks/:symbol',
      history: '/api/stocks/:symbol/history',
      profile: '/api/profile/:symbol',
      health: '/api/health',
      cacheClear: 'POST /api/cache/clear',
      flushCache: 'POST /api/admin/flush-cache',
    },
    trackedStocks: TRACKED_STOCKS,
    timestamp: Date.now(),
  });
});

// Serve static frontend files (production build)
const staticPath = path.resolve(process.cwd(), 'frontend/dist');
console.log('[Server] Serving static files from:', staticPath);
app.use(express.static(staticPath));

// Catch-all: serve index.html for any non-API route (client-side routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Store connected clients with their subscribed symbols
const clients = new Map<WebSocket, Set<string>>();

// Batched subscription handling (prevents API spike on redeployment)
const pendingSubscriptions = new Set<string>();
let subscriptionBatchTimer: NodeJS.Timeout | null = null;
const SUBSCRIPTION_BATCH_DELAY = parseInt(process.env.WS_BATCH_DELAY_MS || '500', 10);
console.log(`[Config] WebSocket subscription batch delay: ${SUBSCRIPTION_BATCH_DELAY}ms`);

// Process batched subscriptions
const processBatchedSubscriptions = async () => {
  if (pendingSubscriptions.size === 0) { return; }

  const symbols = [...pendingSubscriptions];
  pendingSubscriptions.clear();
  subscriptionBatchTimer = null;

  const marketStatus = getMarketStatus();
  if (!isMarketOpen()) {
    console.log(`[WebSocket] Market closed (${marketStatus.message}) - serving ${symbols.length} symbols from cache`);
  } else {
    console.log(`[WebSocket] Market open - processing batched subscriptions for ${symbols.length} symbols`);
  }

  // Fetch all in one batch using getQuotes (which has rate limit and market hours awareness)
  const quotes = await finnhubService.getQuotes(symbols, { batchSize: 3, delayMs: 1000 });

  // Broadcast to all clients
  quotes.forEach((quote) => {
    broadcastToSymbol(quote.symbol, quote);
  });
};

// Queue a symbol for batched fetching
const queueSubscription = (symbol: string) => {
  pendingSubscriptions.add(symbol);

  if (!subscriptionBatchTimer) {
    subscriptionBatchTimer = setTimeout(processBatchedSubscriptions, SUBSCRIPTION_BATCH_DELAY);
  }
};

// Broadcast to all clients subscribed to a symbol
const broadcastToSymbol = (symbol: string, data: StockQuote) => {
  // Strip isCached flag for WebSocket - real-time updates are always "fresh"
  const { isCached, ...cleanData } = data;

  const message: WebSocketMessage = {
    type: 'quote',
    symbol,
    data: cleanData,
  };

  const messageStr = JSON.stringify(message);

  clients.forEach((subscribedSymbols, ws) => {
    if (subscribedSymbols.has(symbol)) {
      ws.send(messageStr);
    }
  });
};

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('[WebSocket] New client connected');

  const subscribedSymbols = new Set<string>();
  clients.set(ws, subscribedSymbols);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AIPulse WebSocket',
    trackedStocks: TRACKED_STOCKS,
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.action === 'subscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscribedSymbols.add(symbol);
        console.log(`[WebSocket] Client subscribed to ${symbol}`);

        // Try to get cached data first (Redis/DB survives restarts)
        const cachedQuote = await finnhubService.getQuote(symbol);

        if (cachedQuote) {
          // Send cached data immediately
          ws.send(JSON.stringify({
            type: 'quote',
            symbol,
            data: cachedQuote,
          }));

          // If this is cached (not fresh) data, also queue for API refresh
          if (cachedQuote.isCached || cachedQuote.timestamp < Date.now() / 1000 - STALE_DATA_THRESHOLD) {
            queueSubscription(symbol);
          }
        } else {
          // No cache available, queue for batched API fetch
          queueSubscription(symbol);

          // Notify client that data is loading
          ws.send(JSON.stringify({
            type: 'loading',
            symbol,
            message: 'Fetching initial data...',
          }));
        }
      }

      if (data.action === 'unsubscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscribedSymbols.delete(symbol);
        console.log(`[WebSocket] Client unsubscribed from ${symbol}`);
      }
    } catch (_error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format',
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
  });
});

// Auto-refresh interval - optimized for Finnhub free tier (60 calls/min)
// Default 120s = 30 calls/min for 12 stocks, leaving 30 calls for other operations
console.log(`[Config] Auto-refresh interval: ${AUTO_REFRESH_INTERVAL}ms (${(AUTO_REFRESH_INTERVAL / 1000).toFixed(0)}s)`);
console.log(`[Config] Rate limit buffer: ${RATE_LIMIT_BUFFER} calls reserved for user requests`);

setInterval(async () => {
  if (clients.size === 0) { return; }

  // Skip auto-refresh when market is closed to preserve API quota
  if (!isMarketOpen()) {
    const marketStatus = getMarketStatus();
    console.log(`[Auto-refresh] Market closed (${marketStatus.message}) - skipping auto-refresh to preserve API quota`);
    return;
  }

  const activeSymbols = new Set<string>();
  clients.forEach((symbols) => {
    symbols.forEach((symbol) => activeSymbols.add(symbol));
  });

  if (activeSymbols.size === 0) { return; }

  const rateLimitStatus = finnhubService.getRateLimitStatus();
  // Be more conservative: reserve buffer calls for user-initiated requests
  if (rateLimitStatus.callsRemaining < activeSymbols.size + RATE_LIMIT_BUFFER) {
    console.log(`[Auto-refresh] Skipping update - rate limit low (${rateLimitStatus.callsRemaining} remaining, need ${activeSymbols.size + RATE_LIMIT_BUFFER})`);
    return;
  }

  console.log(`[Auto-refresh] Market open - fetching updates for ${activeSymbols.size} symbols (${rateLimitStatus.callsRemaining} calls remaining)`);

  const symbols = [...activeSymbols];
  // Use larger delays between batches to spread load across the minute
  const quotes = await finnhubService.getQuotes(symbols, { batchSize: 3, delayMs: 1000 });

  quotes.forEach((quote) => {
    broadcastToSymbol(quote.symbol, quote);

    // Update candle buffer with new price data
    candleBufferService.updatePrice(quote.symbol, quote.currentPrice, 0, Date.now());
  });
}, AUTO_REFRESH_INTERVAL);

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  // Stop candle buffer timers
  console.log('[Shutdown] Stopping candle buffer timers...');
  candleBufferService.stop();

  // Flush L1 cache to Redis
  console.log('[Shutdown] Flushing L1 cache to Redis...');
  await candleBufferService.flushL1ToRedis();

  // Flush Redis to TimescaleDB
  console.log('[Shutdown] Flushing Redis to TimescaleDB...');
  await candleBufferService.flushRedisToDatabase();

  // Close WebSocket server
  console.log('[Shutdown] Closing WebSocket server...');
  wss.clients.forEach((ws) => {
    ws.terminate();
  });
  wss.close();

  // Close HTTP server
  console.log('[Shutdown] Closing HTTP server...');
  server.close(() => {
    console.log('[Shutdown] HTTP server closed');
  });

  // Disconnect from Redis
  console.log('[Shutdown] Disconnecting from Redis...');
  await redisService.disconnect();

  // Disconnect from TimescaleDB
  console.log('[Shutdown] Disconnecting from TimescaleDB...');
  await databaseService.disconnect();

  console.log('[Shutdown] All connections closed. Exiting.');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled rejection at:', promise, 'reason:', reason);
});

// Initialize services and start server
async function initializeServer(): Promise<void> {
  console.log('[Init] Connecting to TimescaleDB...');
  const dbConnected = await databaseService.connect();
  if (!dbConnected) {
    console.error('[Init] Failed to connect to TimescaleDB. Continuing without persistent storage...');
  }

  console.log('[Init] Connecting to Redis...');
  const redisConnected = await redisService.connect();
  if (!redisConnected) {
    console.error('[Init] Failed to connect to Redis. Continuing without L2 cache...');
  }

  // Recovery: Check for orphaned data in Redis
  if (dbConnected && redisConnected) {
    console.log('[Init] Checking for orphaned data to recover...');
    const recovered = await candleBufferService.recoverFromRestart();
    if (recovered > 0) {
      console.log(`[Init] Recovered ${recovered} candles from previous session`);
    } else {
      console.log('[Init] No orphaned data found');
    }
  }

  // Start candle buffer persistence timers
  candleBufferService.start();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    AIPulse Server                          ║
║              AI Stock Monitoring API                       ║
╠════════════════════════════════════════════════════════════╣
║  HTTP Server: http://localhost:${PORT}                      ║
║  WebSocket:   ws://localhost:${PORT}/ws                     ║
╠════════════════════════════════════════════════════════════╣
║  Data Layer:                                               ║
║    ${dbConnected ? '✅' : '❌'} TimescaleDB (Persistent Storage)                      ║
║    ${redisConnected ? '✅' : '❌'} Redis (L2 Cache with AOF)                         ║
║    ✅ In-Memory (L1 Cache)                                  ║
╠════════════════════════════════════════════════════════════╣
║  API Endpoints:                                            ║
║    GET  /api/stocks         - All stocks                   ║
║    GET  /api/stocks/:symbol - Specific stock             ║
║    GET  /api/stocks/:symbol/history - Price history      ║
║    GET  /api/health         - Health check                 ║
║    GET  /api/rate-limit     - Rate limit status            ║
║    POST /api/admin/flush-cache - Manual flush (dev)      ║
╠════════════════════════════════════════════════════════════╣
║  Tracked Stocks: ${TRACKED_STOCKS.length} companies                         ║
║  CORS Origin: ${CORS_ORIGIN}          ║
║  Rate Limit: ${process.env.FINNHUB_MAX_CALLS_PER_MINUTE || '58'}/60 calls/min (limit: ${process.env.FINNHUB_MAX_CALLS_PER_MINUTE || '58'})      ║
║  Auto-refresh: ${(AUTO_REFRESH_INTERVAL / 1000).toFixed(0)}s interval + ${RATE_LIMIT_BUFFER} call buffer     ║
╚════════════════════════════════════════════════════════════╝
    `);

    if (!finnhubService.isConfigured()) {
      console.warn('\n⚠️  WARNING: FINNHUB_API_KEY not configured!');
      console.warn('   Set your API key in backend/.env file');
      console.warn('   Get a free API key at: https://finnhub.io\n');
    } else {
      console.log('\n✅ Finnhub API configured');
      console.log(`   Rate limit: ${finnhubService.getRateLimitStatus().callsRemaining}/${process.env.FINNHUB_MAX_CALLS_PER_MINUTE || '58'} calls available`);
      console.log('   Three-tier cache: L1 (memory) → L2 (Redis AOF) → L3 (TimescaleDB)\n');

      // Startup cache warm-up for development (fetch fresh data immediately)
      if (process.env.WARM_CACHE_ON_STARTUP === 'true') {
        console.log('[Startup] Warming cache with fresh data...');
        // Wait a moment for any existing connections to stabilize
        setTimeout(async () => {
          const rateStatus = finnhubService.getRateLimitStatus();
          if (rateStatus.callsRemaining >= TRACKED_STOCKS.length) {
            const quotes = await finnhubService.getQuotes([...TRACKED_STOCKS], { batchSize: 6, delayMs: 500 });
            console.log(`[Startup] Cache warmed with ${quotes.length} fresh quotes`);
          } else {
            console.log(`[Startup] Skipping warm-up - rate limit too low (${rateStatus.callsRemaining} remaining)`);
          }
        }, 2000);
      }
    }
  });
}

// Start the server
initializeServer().catch((error) => {
  console.error('[Fatal] Failed to initialize server:', error);
  process.exit(1);
});

export default app;
