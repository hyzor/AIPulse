import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST before any other imports
// This ensures process.env is populated before services are instantiated
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Debug: Log environment status (mask API key for security)
const apiKey = process.env.FINNHUB_API_KEY;
console.log('[Config] Environment loaded from:', path.resolve(__dirname, '../.env'));
console.log('[Config] FINNHUB_API_KEY present:', apiKey ? 'Yes' : 'No');
console.log('[Config] FINNHUB_API_KEY length:', apiKey ? apiKey.length : 0);
if (apiKey) {
  console.log('[Config] FINNHUB_API_KEY preview:', apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4));
}

// Now import everything else
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import stockRoutes from './routes/stockRoutes';
import { finnhubService } from './services/finnhubService';
import { databaseService } from './services/databaseService';
import { redisService } from './services/redisService';
import { candleBufferService } from './services/candleBufferService';
import { TRACKED_STOCKS } from './constants';
import type { WebSocketMessage, StockQuote, HealthStatus } from './types';
import type WebSocket from 'ws';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api', stockRoutes);

// Root endpoint
app.get('/', (_req, res) => {
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
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.action === 'subscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscribedSymbols.add(symbol);
        console.log(`[WebSocket] Client subscribed to ${symbol}`);
        
        // Send initial data
        finnhubService.getQuote(symbol).then(quote => {
          ws.send(JSON.stringify({
            type: 'quote',
            symbol,
            data: quote,
          }));
        }).catch(err => {
          ws.send(JSON.stringify({
            type: 'error',
            error: `Failed to fetch ${symbol}: ${err.message}`,
          }));
        });
      }
      
      if (data.action === 'unsubscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscribedSymbols.delete(symbol);
        console.log(`[WebSocket] Client unsubscribed from ${symbol}`);
      }
    } catch (error) {
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

// Auto-refresh interval (every 60 seconds - conservative for free tier)
const AUTO_REFRESH_INTERVAL = 60000;

setInterval(async () => {
  if (clients.size === 0) return;
  
  const activeSymbols = new Set<string>();
  clients.forEach((symbols) => {
    symbols.forEach(symbol => activeSymbols.add(symbol));
  });
  
  if (activeSymbols.size === 0) return;
  
  const rateLimitStatus = finnhubService.getRateLimitStatus();
  if (rateLimitStatus.callsRemaining < activeSymbols.size) {
    console.log(`[Auto-refresh] Skipping update - rate limit low (${rateLimitStatus.callsRemaining} remaining)`);
    return;
  }
  
  console.log(`[Auto-refresh] Fetching updates for ${activeSymbols.size} symbols (${rateLimitStatus.callsRemaining} calls remaining)`);
  
  const symbols = [...activeSymbols];
  const quotes = await finnhubService.getQuotes(symbols, { batchSize: 6, delayMs: 500 });
  
  quotes.forEach(quote => {
    broadcastToSymbol(quote.symbol, quote);
    
    // Update candle buffer with new price data
    candleBufferService.updatePrice(quote.symbol, quote.currentPrice, 0, Date.now());
  });
}, AUTO_REFRESH_INTERVAL);

// Pre-cache refresh (every 2 minutes - only if rate limit allows)
setInterval(async () => {
  const rateLimitStatus = finnhubService.getRateLimitStatus();
  
  if (rateLimitStatus.callsRemaining < TRACKED_STOCKS.length + 10) {
    console.log('[Pre-cache] Skipping - rate limit too low');
    return;
  }
  
  console.log(`[Pre-cache] Refreshing all tracked stocks (${rateLimitStatus.callsRemaining} calls remaining)`);
  const quotes = await finnhubService.getQuotes([...TRACKED_STOCKS], { batchSize: 6, delayMs: 500 });
  
  // Update candle buffer with pre-cache data
  quotes.forEach(quote => {
    candleBufferService.updatePrice(quote.symbol, quote.currentPrice, 0, Date.now());
  });
}, 120000);

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
║  Rate Limit: 60 calls/min (Finnhub Free Tier)              ║
╚════════════════════════════════════════════════════════════╝
    `);
    
    if (!finnhubService.isConfigured()) {
      console.warn('\n⚠️  WARNING: FINNHUB_API_KEY not configured!');
      console.warn('   Set your API key in backend/.env file');
      console.warn('   Get a free API key at: https://finnhub.io\n');
    } else {
      console.log('\n✅ Finnhub API configured');
      console.log('   Rate limit tracking enabled');
      console.log('   Three-tier cache: L1 (memory) → L2 (Redis AOF) → L3 (TimescaleDB)\n');
    }
  });
}

// Start the server
initializeServer().catch((error) => {
  console.error('[Fatal] Failed to initialize server:', error);
  process.exit(1);
});

export default app;
