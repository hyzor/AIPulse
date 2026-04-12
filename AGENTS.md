# AIPulse - Agent Instructions

This document provides comprehensive context for AI agents working on the AIPulse project.

## Project Overview

**AIPulse** is a real-time AI stock monitoring web application with a dark theme UI, server-side caching, WebSocket-based live updates, and rate limiting for the Finnhub API free tier.

### Purpose
Monitor stock prices for AI/tech companies (NVDA, AMD, TSM, ASML, etc.) with real-time updates and intelligent caching to minimize API costs.

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 20+, Express 4.x, TypeScript 5.x |
| **Frontend** | React 18, TypeScript 5.x, Vite 5.x |
| **Styling** | Tailwind CSS 3.4 (dark theme) |
| **Real-time** | WebSocket (ws library) |
| **Caching** | node-cache |
| **API** | Finnhub API (free tier: 60 calls/min) |
| **Icons** | Lucide React |

### Project Structure

```
AIPulse/
├── backend/
│   ├── src/
│   │   ├── constants.ts          # Stock symbols, display names
│   │   ├── server.ts             # Express + WebSocket server
│   │   ├── routes/
│   │   │   └── stockRoutes.ts    # API endpoints
│   │   ├── services/
│   │   │   ├── cacheService.ts   # Server-side caching
│   │   │   ├── finnhubService.ts  # Finnhub API integration
│   │   │   └── rateLimiter.ts    # Rate limiting (60 calls/min)
│   │   └── types/
│   │       └── index.ts          # TypeScript types
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx        # Top navigation bar
│   │   │   ├── StockCard.tsx     # Stock display card
│   │   │   └── StatusBar.tsx     # Status indicators
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts   # WebSocket hook
│   │   ├── services/
│   │   │   └── stockService.ts   # API client
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
└── deployment/                   # Deployment configs
    ├── aipulse.service           # Systemd
    └── nginx.conf                # Nginx reverse proxy
```

---

## Getting Started

### Prerequisites
- Node.js 20 or higher
- npm 10 or higher
- Git
- Finnhub API key (free at https://finnhub.io)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd AIPulse

# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Configuration

**Backend (backend/.env):**
```
PORT=3001
FINNHUB_API_KEY=your_finnhub_api_key_here
CORS_ORIGIN=http://localhost:5173
CACHE_TTL_SECONDS=60
```

**Frontend (frontend/.env):**
```
VITE_API_URL=              # Empty for proxy in dev
VITE_WS_URL=ws://localhost:3001/ws
```

### Running Development Servers

**Option 1: From root (recommended)**
```bash
npm run dev
```
Starts both backend (port 3001) and frontend (port 5173) with hot reload.

**Option 2: Separate terminals**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

---

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile to dist/
npm run start        # Run compiled code
npm run typecheck    # TypeScript check (no emit)
```

### Frontend
```bash
cd frontend
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run typecheck    # TypeScript check (no emit)
```

### Root
```bash
npm run dev          # Start both backend and frontend
npm run build        # Build frontend
npm run start        # Start production backend
npm run typecheck    # TypeScript check for both
```

---

## API Endpoints

| Endpoint | Method | Description | Cache |
|----------|--------|-------------|-------|
| `/` | GET | Server info | No |
| `/api/stocks` | GET | Get all tracked stocks | 60s |
| `/api/stocks/:symbol` | GET | Get specific stock | 60s |
| `/api/profile/:symbol` | GET | Company profile | 1hr |
| `/api/health` | GET | Health check | No |
| `/api/rate-limit` | GET | Rate limit status | No |
| `/api/cache/clear` | POST | Clear server cache | No |
| `/ws` | WebSocket | Real-time updates | N/A |

### WebSocket Protocol

**Subscribe to stock:**
```json
{ "action": "subscribe", "symbol": "NVDA" }
```

**Unsubscribe:**
```json
{ "action": "unsubscribe", "symbol": "NVDA" }
```

**Incoming message:**
```json
{
  "type": "quote",
  "symbol": "NVDA",
  "data": { /* StockQuote */ }
}
```

---

## Key Types

### Backend (backend/src/types/index.ts)
```typescript
interface StockQuote {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  previousClose: number;
  timestamp: number;
}

interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Change percent
  h: number;  // High
  l: number;  // Low
  o: number;  // Open
  pc: number; // Previous close
  t: number;  // Timestamp
}
```

### Frontend (frontend/src/types/index.ts)
Matches backend types + `RateLimitStatus`, `WebSocketMessage`.

---

## Tracked Stocks

| Symbol | Company | Category |
|--------|---------|----------|
| NVDA | NVIDIA | AI Chips |
| AMD | AMD | AI Chips |
| AVGO | Broadcom | Semiconductors |
| MRVL | Marvell | Semiconductors |
| TSM | TSMC | Semiconductors |
| ASML | ASML | Semiconductors |
| ARM | ARM Holdings | Semiconductors |
| PLTR | Palantir | AI Software |
| MSFT | Microsoft | AI Software |
| GOOGL | Alphabet | AI Software |
| AMZN | Amazon | Tech Giants |
| TSLA | Tesla | Tech Giants |

Modify in `backend/src/constants.ts` and `frontend/src/types/index.ts`.

---

## Rate Limiting (Important!)

Finnhub free tier: **60 calls/minute**

Our protection:
- Max 55 calls/min (leaves buffer)
- Warning at 45 calls (75%)
- Batch processing: 6 stocks/batch with 500ms delays
- Auto-refresh: 60s intervals (not 30s)
- Pre-cache: 2min intervals (not 1min)
- Graceful degradation to cached data when limit hit

**Never exceed 12 stocks × 2 refreshes/min = 24 calls/min normal operation.**

---

## Deployment

### Docker (Recommended)
```bash
docker-compose up -d
```

### PM2
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Vercel
```bash
npm i -g vercel
vercel --prod
```

### Manual Server
```bash
# Build
npm run build

# Start
cd backend
npm start
```

See `DEPLOYMENT.md` for detailed instructions.

---

## Testing

### Manual Testing Checklist
- [ ] Server starts without errors
- [ ] API key configured (no warning)
- [ ] GET /api/stocks returns 12 stocks
- [ ] GET /api/health returns healthy
- [ ] WebSocket connects (check browser console)
- [ ] Rate limit shows in StatusBar
- [ ] Stock cards display with correct colors
- [ ] Refresh button works
- [ ] Cache hit logs appear

### API Testing
```bash
# Test endpoints
curl http://localhost:3001/api/health
curl http://localhost:3001/api/stocks
curl http://localhost:3001/api/rate-limit

# Test WebSocket
wscat -c ws://localhost:3001/ws
> {"action":"subscribe","symbol":"NVDA"}
```

---

## Environment Variables

### Backend
| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3001 | No | Server port |
| `FINNHUB_API_KEY` | - | Yes | Finnhub API key |
| `CORS_ORIGIN` | http://localhost:5173 | No | Frontend URL |
| `CACHE_TTL_SECONDS` | 60 | No | Cache time-to-live |

### Frontend
| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_API_URL` | (empty) | No | API base URL |
| `VITE_WS_URL` | ws://localhost:3001/ws | No | WebSocket URL |

---

## Common Issues & Solutions

### "FINNHUB_API_KEY not configured!"
- Ensure `.env` is in `backend/` folder
- Check key has no spaces around `=`
- Restart server after changing `.env`

### WebSocket won't connect
- Check port 3001 not blocked
- Verify `VITE_WS_URL` matches backend
- Check browser console for errors

### 429 Rate Limit errors
- Normal - means protection is working
- Check `/api/rate-limit` for status
- Cached data will be served automatically

### Frontend can't reach backend
- Check CORS_ORIGIN matches frontend URL
- Verify Vite proxy config in `vite.config.ts`

### TypeScript errors
```bash
npm run typecheck  # Check both
```

---

## Code Style

### TypeScript
- Strict mode enabled
- No `any` types
- Explicit return types on functions
- Interface names: PascalCase
- Variable names: camelCase
- Constants: UPPER_SNAKE_CASE

### React
- Functional components with hooks
- Props interfaces defined
- No class components
- Custom hooks for shared logic

### CSS (Tailwind)
- Dark theme: `bg-dark-900`, `text-white`
- Neon accents: `neon-blue`, `neon-green`, `neon-red`
- No custom CSS files (use Tailwind)
- Responsive: `sm:`, `md:`, `lg:`, `xl:` prefixes

### Backend
- Async/await (no callbacks)
- Try-catch with specific error messages
- Services for business logic
- Routes for HTTP handling
- Caching on all external API calls

---

## Adding New Features

### Adding a New Stock
1. Add symbol to `TRACKED_STOCKS` in `backend/src/constants.ts`
2. Add display name to `STOCK_DISPLAY_NAMES`
3. Add to appropriate `STOCK_CATEGORIES`
4. Sync changes to `frontend/src/types/index.ts`
5. Restart both servers

### Adding a New API Endpoint
1. Add route in `backend/src/routes/stockRoutes.ts`
2. Add service method if needed
3. Add type to `backend/src/types/index.ts`
4. Add frontend service method
5. Add frontend type
6. Test with curl/browser

### Adding WebSocket Events
1. Add message type to `WebSocketMessage` interface
2. Handle in `server.ts` WebSocket `on('message')`
3. Update `useWebSocket.ts` hook
4. Handle in component

---

## Performance Guidelines

### Backend
- Always check cache before API calls
- Batch external requests
- Use rate limiter for all external APIs
- Set appropriate cache TTLs (quotes: 60s, profiles: 1hr)

### Frontend
- Use WebSocket for real-time (not polling)
- Memoize expensive calculations
- Lazy load components if app grows
- Virtualize lists if tracking 100+ stocks

---

## Security Notes

- API keys in `.env` (never commit!)
- `.gitignore` excludes `.env` files
- CORS configured for specific origin
- No SQL injection risk (no SQL database)
- Input validation on all routes

---

## Documentation

- `README.md` - User-facing setup and usage
- `DEPLOYMENT.md` - Deployment instructions
- `AGENTS.md` - This file (agent context)
- Inline JSDoc for complex functions

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/my-feature

# Commit
git add .
git commit -m "feat: add new feature

Description of what and why"

# Push
git push origin feature/my-feature

# Merge via PR
```

### Commit Message Style
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `perf:` Performance
- `test:` Tests

---

## License

MIT License - See `LICENSE` file

---

## Resources

- **Finnhub API Docs**: https://finnhub.io/docs/api
- **React Docs**: https://react.dev
- **Express Docs**: https://expressjs.com
- **Tailwind Docs**: https://tailwindcss.com
- **Vite Docs**: https://vitejs.dev

---

## Need Help?

1. Check `README.md` for setup issues
2. Check `DEPLOYMENT.md` for deployment issues
3. Check server logs for backend errors
4. Check browser console for frontend errors
5. Verify all env vars are set
6. Test API endpoints with curl

---

Last Updated: 2026-04-12
Version: 1.0.0
