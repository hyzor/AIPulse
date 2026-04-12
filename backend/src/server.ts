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
import { TRACKED_STOCKS } from './constants';
import type { WebSocketMessage, StockQuote } from './types';

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
app.get('/', (req, res) => {
  res.json({
    name: 'AIPulse API',
    version: '1.0.0',
    description: 'AI Stock Monitoring API',
    endpoints: {
      stocks: '/api/stocks',
      stockDetail: '/api/stocks/:symbol',
      profile: '/api/profile/:symbol',
      health: '/api/health',
      cacheClear: 'POST /api/cache/clear',
    },
    trackedStocks: TRACKED_STOCKS,
    timestamp: Date.now(),
  });
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
// With 12 stocks: 12 calls/min for WebSocket + 12 calls/min for pre-cache = 24/min
// Well under the 60 calls/min free tier limit
const AUTO_REFRESH_INTERVAL = 60000;

setInterval(async () => {
  if (clients.size === 0) return;
  
  // Get all unique symbols that clients are subscribed to
  const activeSymbols = new Set<string>();
  clients.forEach((symbols) => {
    symbols.forEach(symbol => activeSymbols.add(symbol));
  });
  
  if (activeSymbols.size === 0) return;
  
  // Check rate limit before fetching
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
  });
}, AUTO_REFRESH_INTERVAL);

// Pre-cache refresh (every 2 minutes - only if rate limit allows)
// Provides fallback data when real-time updates hit limits
setInterval(async () => {
  const rateLimitStatus = finnhubService.getRateLimitStatus();
  
  // Only pre-cache if we have plenty of quota left
  if (rateLimitStatus.callsRemaining < TRACKED_STOCKS.length + 10) {
    console.log('[Pre-cache] Skipping - rate limit too low');
    return;
  }
  
  console.log(`[Pre-cache] Refreshing all tracked stocks (${rateLimitStatus.callsRemaining} calls remaining)`);
  await finnhubService.getQuotes([...TRACKED_STOCKS], { batchSize: 6, delayMs: 500 });
}, 120000); // Every 2 minutes

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    AIPulse Server                          ║
║              AI Stock Monitoring API                       ║
╠════════════════════════════════════════════════════════════╣
║  HTTP Server: http://localhost:${PORT}                      ║
║  WebSocket:   ws://localhost:${PORT}/ws                     ║
╠════════════════════════════════════════════════════════════╣
║  API Endpoints:                                            ║
║    GET  /api/stocks         - All stocks                   ║
║    GET  /api/stocks/:symbol - Specific stock             ║
║    GET  /api/health         - Health check                 ║
║    GET  /api/rate-limit     - Rate limit status            ║
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
    console.log('   Conservative fetch intervals (60s refresh, 2m pre-cache)\n');
  }
});

export default app;
