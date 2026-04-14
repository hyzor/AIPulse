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
import { backgroundCollector, setHistoricalUpdateCallback } from './services/backgroundCollector';
import { getCachedQuote } from './services/cacheLookupService';
import { candleBufferService } from './services/candleBufferService';
import { databaseService } from './services/databaseService';
import { finnhubService } from './services/finnhubService';
import { redisService } from './services/redisService';


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
      refresh: 'POST /api/stocks/:symbol/refresh - Manual refresh for live data',
    },
    trackedStocks: TRACKED_STOCKS,
    timestamp: Date.now(),
  });
});

// Manual refresh endpoint - fetches live data from API if capacity available
app.post('/api/stocks/:symbol/refresh', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  console.log(`[API] Manual refresh requested for ${upperSymbol}`);

  const rateLimitStatus = finnhubService.getRateLimitStatus();

  // Check API capacity - prioritize background collection
  // Only allow manual refresh if we have significant capacity remaining
  if (rateLimitStatus.callsRemaining < 15) {
    // Serve from cache
    const cachedResult = await getCachedQuote(upperSymbol);
    if (cachedResult) {
      return res.json({
        success: false,
        cached: true,
        symbol: upperSymbol,
        data: cachedResult.quote,
        message: 'API rate limit near capacity. Serving cached data. Background collector has priority.',
        rateLimit: rateLimitStatus,
      });
    }
    return res.status(503).json({
      success: false,
      error: 'API rate limit reached and no cached data available',
      rateLimit: rateLimitStatus,
    });
  }

  try {
    const freshQuote = await finnhubService.getQuote(upperSymbol, true); // Skip cache

    if (freshQuote) {
      // Update candle buffer with fresh data (for historical charts)
      candleBufferService.updatePrice(upperSymbol, freshQuote.currentPrice, 0, Date.now());

      // Also update latest quote in DB immediately (so stats show this symbol has data)
      // Pass the ORIGINAL timestamp from Finnhub (in seconds), not current time
      await candleBufferService.updateLatestQuote(upperSymbol, {
        currentPrice: freshQuote.currentPrice,
        change: freshQuote.change,
        changePercent: freshQuote.changePercent,
        high: freshQuote.highPrice,
        low: freshQuote.lowPrice,
        open: freshQuote.openPrice,
        previousClose: freshQuote.previousClose,
        volume: 0,
      }, 'api', freshQuote.timestamp * 1000); // Convert seconds to ms for storage

      // Broadcast to all WebSocket subscribers
      broadcastToSymbol(upperSymbol, freshQuote);

      return res.json({
        success: true,
        cached: false,
        symbol: upperSymbol,
        data: freshQuote,
        message: 'Live data fetched successfully',
        rateLimit: finnhubService.getRateLimitStatus(),
      });
    }

    return res.status(404).json({
      success: false,
      error: `No data available for ${upperSymbol}`,
    });
  } catch (error) {
    console.error(`[API] Refresh failed for ${upperSymbol}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch live data',
    });
  }
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

// Broadcast to all clients subscribed to a symbol
const broadcastToSymbol = (symbol: string, data: StockQuote) => {
  const message: WebSocketMessage = {
    type: 'quote',
    symbol,
    data,
  };

  const messageStr = JSON.stringify(message);

  clients.forEach((subscribedSymbols, ws) => {
    if (subscribedSymbols.has(symbol)) {
      ws.send(messageStr);
    }
  });
};

// Broadcast historical data update to all subscribed clients
const broadcastHistoricalUpdate = (symbol: string) => {
  const message = {
    type: 'historicalUpdate',
    symbol,
    timestamp: Date.now(),
  };

  const messageStr = JSON.stringify(message);

  clients.forEach((subscribedSymbols, ws) => {
    if (subscribedSymbols.has(symbol)) {
      ws.send(messageStr);
    }
  });
};

// Export for use by background collector
export { broadcastHistoricalUpdate };

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

        // Serve from cache ONLY - no API calls on subscribe
        // Background collector keeps cache updated
        const cachedResult = await getCachedQuote(symbol);

        if (cachedResult) {
          // Send cached data immediately
          ws.send(JSON.stringify({
            type: 'quote',
            symbol,
            data: cachedResult.quote,
          }));

          // Indicate if data is stale (older than threshold)
          const isStale = cachedResult.quote.timestamp < Date.now() / 1000 - STALE_DATA_THRESHOLD;
          if (isStale) {
            ws.send(JSON.stringify({
              type: 'info',
              symbol,
              message: 'Data may be stale. Click refresh for live data.',
              isStale: true,
            }));
          }
        } else {
          // No cache available - background collector should populate it soon
          ws.send(JSON.stringify({
            type: 'loading',
            symbol,
            message: 'Waiting for background data collection...',
          }));
        }
      }

      if (data.action === 'unsubscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscribedSymbols.delete(symbol);
        console.log(`[WebSocket] Client unsubscribed from ${symbol}`);
      }

      // Manual refresh request - fetches fresh data if API capacity available
      if (data.action === 'refresh' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        console.log(`[WebSocket] Manual refresh requested for ${symbol}`);

        const rateLimitStatus = finnhubService.getRateLimitStatus();

        // Only fetch live data if we have API capacity
        if (rateLimitStatus.callsRemaining > 10) { // Reserve some for background
          try {
            const freshQuote = await finnhubService.getQuote(symbol, true); // Skip cache
            if (freshQuote) {
              // Update candle buffer with fresh data (for historical charts)
              candleBufferService.updatePrice(symbol, freshQuote.currentPrice, 0, Date.now());

              // Also update latest quote in DB immediately
              // Pass the ORIGINAL timestamp from Finnhub (in seconds), not current time
              await candleBufferService.updateLatestQuote(symbol, {
                currentPrice: freshQuote.currentPrice,
                change: freshQuote.change,
                changePercent: freshQuote.changePercent,
                high: freshQuote.highPrice,
                low: freshQuote.lowPrice,
                open: freshQuote.openPrice,
                previousClose: freshQuote.previousClose,
                volume: 0,
              }, 'api', freshQuote.timestamp * 1000); // Convert seconds to ms for storage

              // Broadcast to all subscribers
              broadcastToSymbol(symbol, freshQuote);

              // Confirm to requesting client
              ws.send(JSON.stringify({
                type: 'refreshed',
                symbol,
                data: freshQuote,
                message: 'Live data fetched successfully',
              }));
            }
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              symbol,
              message: 'Failed to fetch live data. Using cached data.',
            }));
          }
        } else {
          // No API capacity - serve from cache
          const cachedResult = await getCachedQuote(symbol);
          if (cachedResult) {
            ws.send(JSON.stringify({
              type: 'quote',
              symbol,
              data: cachedResult.quote,
              message: 'API rate limit reached. Serving cached data.',
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              symbol,
              message: 'No data available and API rate limit reached. Please try again later.',
            }));
          }
        }
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

// Background Data Collection
// Runs independently of WebSocket clients
// Maximizes API usage for historical data building
console.log('[Server] Initializing background data collection service...');

// Listen for new data from background collector and broadcast to clients
// This hook will be called by the background collector after each collection
const originalUpdatePrice = candleBufferService.updatePrice.bind(candleBufferService);
candleBufferService.updatePrice = (symbol: string, price: number, volume?: number, timestamp?: number) => {
  // Call original method
  originalUpdatePrice(symbol, price, volume, timestamp);

  // Broadcast to WebSocket clients if any are subscribed
  // Get the latest quote from Redis (which was just updated)
  redisService.getLatestQuote(symbol).then((redisQuote) => {
    if (redisQuote) {
      const quote: StockQuote = {
        symbol,
        currentPrice: redisQuote.currentPrice,
        change: redisQuote.change,
        changePercent: redisQuote.changePercent,
        highPrice: redisQuote.high,
        lowPrice: redisQuote.low,
        openPrice: redisQuote.open,
        previousClose: redisQuote.previousClose,
        timestamp: Math.floor(redisQuote.timestamp / 1000), // Convert ms to seconds
      };
      broadcastToSymbol(symbol, quote);
    }
  });
};

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

  // Register callback for historical data updates to broadcast via WebSocket
  setHistoricalUpdateCallback((symbol) => {
    broadcastHistoricalUpdate(symbol);
  });

  // Start background data collection service
  // This runs independently and maximizes API usage for historical data
  backgroundCollector.start();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    AIPulse Server                          ║
║         AI Stock Monitoring API with Background Collection ║
╠════════════════════════════════════════════════════════════╣
║  HTTP Server: http://localhost:${PORT}                      ║
║  WebSocket:   ws://localhost:${PORT}/ws                     ║
╠════════════════════════════════════════════════════════════╣
║  Data Layer:                                               ║
║    ${dbConnected ? '✅' : '❌'} TimescaleDB (Persistent Storage)                      ║
║    ${redisConnected ? '✅' : '❌'} Redis (L2 Cache with AOF)                         ║
║    ✅ In-Memory (L1 Cache)                                  ║
╠════════════════════════════════════════════════════════════╣
║  Architecture:                                             ║
║    📊 Background Collector: Auto-runs during market hours  ║
║    📡 WebSocket: Serves from cache (no API calls)          ║
║    🔄 Manual Refresh: POST /api/stocks/:symbol/refresh    ║
╠════════════════════════════════════════════════════════════╣
║  API Endpoints:                                            ║
║    GET  /api/stocks              - All stocks              ║
║    GET  /api/stocks/:symbol      - Specific stock        ║
║    POST /api/stocks/:symbol/refresh - Manual refresh     ║
║    GET  /api/stocks/:symbol/history - Price history      ║
║    GET  /api/health              - Health check            ║
║    GET  /api/rate-limit          - Rate limit status       ║
╠════════════════════════════════════════════════════════════╣
║  Tracked Stocks: ${TRACKED_STOCKS.length} companies                         ║
║  Background Collection: ${backgroundCollector.isActive() ? '✅ RUNNING' : '❌ STOPPED'}          ║
║  Rate Limit: ${process.env.FINNHUB_MAX_CALLS_PER_MINUTE || '58'}/60 calls/min (maximized for history) ║
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
