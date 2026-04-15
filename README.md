# AIPulse

A real-time AI stock monitoring web application featuring dark theme UI, historical charts, server-side caching, and WebSocket-based live updates.

![AIPulse](https://img.shields.io/badge/AIPulse-AI%20Stock%20Monitor-blue)
![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)

## Features

### Real-Time Monitoring
- **WebSocket Live Updates**: Real-time price updates during market hours (9:30 AM - 4:00 PM ET)
- **Market Status Indicators**: LIVE, CLOSED, NO DATA, CACHED status per stock
- **Smart Refresh**: Auto-refresh every 15 seconds with intelligent caching

### Historical Charts
- **Multiple Time Ranges**: 1D (5m resolution), 7D (30m resolution), 30D (1h resolution)
- **Granular Data**: Up to 78 data points for 1D, ~91 for 7D, ~195 for 30D
- **Interactive Charts**: Click any stock card to view expanded chart modal
- **Data Collection Progress**: Visual progress bar showing: Data → Today → 2 Days → 7 Days → 30 Days

### Category Performance
- **Sector Grouping**: AI Chips, Semiconductors, AI Software, Tech Giants
- **Average Performance**: Per-category aggregated stats
- **Time Range Selection**: Switch between Today, 7 Days, 30 Days views

### Data Health Monitoring
- **Collection Status**: Real-time widget showing data collection progress
- **Multi-Resolution Stats**: 1-Minute Points, Hourly Candles, Daily Candles counts
- **Per-Symbol Status**: Visual indicators for data availability
- **Smart Warnings**: Alerts when selecting 7D/30D without sufficient history

### Market Awareness
- **Trading Hours**: Market open/closed detection with DST handling
- **Timezone Display**: All times shown in local timezone + ET
- **Next Open Countdown**: Shows when market reopens if closed

## Tracked Stocks (15 Companies)

| Symbol | Company | Category | Exchange |
|--------|---------|----------|----------|
| NVDA | NVIDIA | AI Chips | NASDAQ |
| AMD | AMD | AI Chips | NASDAQ |
| AVGO | Broadcom | Semiconductors | NASDAQ |
| TSM | TSMC | Semiconductors | NYSE |
| ASML | ASML | Semiconductors | NASDAQ |
| ARM | ARM Holdings | Semiconductors | NASDAQ |
| MU | Micron | Semiconductors | NASDAQ |
| SNDK | SanDisk | Semiconductors | NASDAQ |
| MSFT | Microsoft | AI Software | NASDAQ |
| GOOGL | Alphabet | AI Software | NASDAQ |
| META | Meta | AI Software | NASDAQ |
| ORCL | Oracle | AI Software | NYSE |
| AMZN | Amazon | Tech Giants | NASDAQ |
| AAPL | Apple | Tech Giants | NASDAQ |
| TSLA | Tesla | Tech Giants | NASDAQ |

## Tech Stack

### Backend
- **Node.js** 20+ with TypeScript
- **Express** - Web framework
- **WebSocket (ws)** - Real-time communication
- **PostgreSQL + TimescaleDB** - Persistent time-series data storage
- **Redis** - L1 cache and candle buffer
- **node-cache** - L2 in-memory cache
- **Finnhub API** - Stock data provider (60 calls/min free tier)

### Frontend
- **React** 18 - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling with custom dark theme
- **Lucide React** - Icons
- **Recharts** - Data visualization

### Infrastructure
- **Docker & Docker Compose** - Container orchestration
- **PM2** - Process management (optional)
- **Nginx** - Reverse proxy (production)

## Quick Start

### Prerequisites
- Node.js 25 (see `.nvmrc` - use [nvm](https://github.com/nvm-sh/nvm) to manage)
- npm or yarn
- Docker (for databases)
- Finnhub API key (free at [finnhub.io](https://finnhub.io))

### 1. Clone and Install

```bash
git clone <repository-url>
cd AIPulse

# Use correct Node version
nvm use

npm install
```

### 2. Configure Environment

Create a `.env` file:
```bash
cp .env.example .env
# Edit .env and add your FINNHUB_API_KEY
```

**For local development:**
```bash
# Start databases (PostgreSQL + Redis + TimescaleDB)
docker compose -f docker-compose.dev.yml up -d

# The same .env works for both backend and frontend
# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

### 3. Start Development

From the root directory:
```bash
npm run dev
```

This starts:
- Backend API at http://localhost:3001
- Frontend at http://localhost:5173
- WebSocket at ws://localhost:3001/ws

## Project Structure

```
AIPulse/
├── backend/
│   ├── src/
│   │   ├── routes/         # API endpoints (stocks, history, health)
│   │   ├── services/       # Business logic, caching, database
│   │   │   ├── databaseService.ts    # TimescaleDB operations
│   │   │   ├── redisService.ts       # Redis cache layer
│   │   │   ├── finnhubService.ts     # API integration
│   │   │   └── backgroundCollector.ts # Market hours collection
│   │   ├── types/          # TypeScript types
│   │   ├── constants.ts    # Stock lists, configuration
│   │   └── server.ts       # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── StockCard.tsx           # Individual stock display
│   │   │   ├── CategoryPerformance.tsx # Sector overview
│   │   │   ├── DataCollectionStatus.tsx # Collection progress
│   │   │   ├── MiniAreaChart.tsx       # Sparkline charts
│   │   │   └── ExpandedChartModal.tsx  # Full-size charts
│   │   ├── contexts/       # React contexts
│   │   │   └── TimeRangeContext.tsx    # 1D/7D/30D state
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API clients
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Helper functions
│   │   ├── App.tsx         # Main app
│   │   └── main.tsx        # Entry point
│   ├── package.json
│   └── vite.config.ts
├── docs/                   # Documentation
│   ├── MONITORING_IDEAS.md # Feature backlog
│   ├── IMPLEMENTATION_TRACKING.md # Status tracking
│   └── testing-guide.md    # Testing documentation
├── deployment/             # Deployment configs
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── Dockerfile
├── ecosystem.config.js     # PM2 config
└── package.json            # Root workspace config
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stocks` | GET | Get all tracked stocks with quotes |
| `/api/stocks/:symbol` | GET | Get specific stock quote |
| `/api/stocks/:symbol/history` | GET | Get historical candles (1D/7D/30D) |
| `/api/profile/:symbol` | GET | Get company profile |
| `/api/health` | GET | Health check with data stats |
| `/api/rate-limit` | GET | Current API rate limit status |
| `/api/cache/clear` | POST | Clear server cache |
| `/ws` | WebSocket | Real-time price updates |

### History Endpoint Query Parameters

```bash
# Get 1D view with 5m resolution
GET /api/stocks/NVDA/history?range=1d&resolution=5m

# Get 7D view (defaults to 30m)
GET /api/stocks/NVDA/history?range=7d

# Get 30D view (defaults to 1h)
GET /api/stocks/NVDA/history?range=30d
```

## WebSocket Protocol

**Subscribe to a stock:**
```json
{ "action": "subscribe", "symbol": "NVDA" }
```

**Unsubscribe:**
```json
{ "action": "unsubscribe", "symbol": "NVDA" }
```

**Incoming quote:**
```json
{
  "type": "quote",
  "symbol": "NVDA",
  "data": {
    "symbol": "NVDA",
    "currentPrice": 480.50,
    "change": 5.20,
    "changePercent": 1.09,
    "timestamp": 1704067200
  }
}
```

## Three-Tier Cache Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│                    (React + WebSocket)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ WebSocket / HTTP
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  L1: Redis   │  │ L2: node-cache│  │ L3: Latest   │    │
│  │  (Candles)   │  │  (Quotes)     │  │   Quotes     │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────┐                        │
│                    │ TimescaleDB │                        │
│                    │ (Historical)│                        │
│                    └─────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**Cache Strategy:**
- **L1 (Redis)**: 1m/1h candles, 5-60 min TTL
- **L2 (node-cache)**: Stock quotes, 60 sec TTL
- **L3 (DB)**: Latest quotes table for fast lookup
- **Persistent**: TimescaleDB for all historical data

## Development

### Backend Commands
```bash
cd backend
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Run compiled server
npm run typecheck    # Check types
npm run lint         # Run ESLint
```

### Frontend Commands
```bash
cd frontend
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run typecheck    # Check types
npm run lint         # Run ESLint
```

### Testing the Three-Tier Cache

To verify data persistence works (survives restarts):

```bash
# 1. Start databases
docker compose -f docker-compose.dev.yml up -d

# 2. Start backend (keep running)
cd backend && npm run dev

# 3. In another terminal, run tests
.\scripts\test-persistence.ps1        # Windows
./scripts/test-persistence.sh         # Linux/Mac
```

**See [docs/testing-guide.md](docs/testing-guide.md) for detailed documentation.**

## Deployment

### Option 1: Home Lab Server (Docker Compose)

```bash
docker compose up -d
```

### Option 2: PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option 3: Vercel

```bash
npm i -g vercel
vercel --prod
```

Set environment variables:
```bash
vercel env add FINNHUB_API_KEY
```

**See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.**

## Environment Variables

### Backend (.env)
```
PORT=3001
FINNHUB_API_KEY=your_finnhub_api_key_here
CORS_ORIGIN=http://localhost:5173

# Database URLs (auto-configured in Docker)
DATABASE_URL=postgresql://user:pass@localhost:5432/aipulse
REDIS_URL=redis://localhost:6379
```

### Frontend (.env)
```
VITE_API_URL=              # Empty for proxy (dev)
VITE_WS_URL=ws://localhost:3001/ws
```

## Documentation

| Document | Description |
|----------|-------------|
| [AGENTS.md](AGENTS.md) | Technical context for AI agents |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment instructions |
| [docs/MONITORING_IDEAS.md](docs/MONITORING_IDEAS.md) | Feature backlog ideas |
| [docs/IMPLEMENTATION_TRACKING.md](docs/IMPLEMENTATION_TRACKING.md) | Implementation status |
| [docs/testing-guide.md](docs/testing-guide.md) | Testing documentation |

## Troubleshooting

### No data loading
- Check that `FINNHUB_API_KEY` is set correctly
- Verify databases are running: `docker compose -f docker-compose.dev.yml ps`
- Check backend health: `curl http://localhost:3001/api/health`
- Check browser console for CORS errors

### WebSocket not connecting
- Ensure port 3001 is not blocked by firewall
- Check that `VITE_WS_URL` matches backend URL
- Verify backend is running and WebSocket endpoint is accessible

### Charts showing "Collecting data..."
- Historical charts require data collection during market hours
- Wait for 1-hour aggregates to process (auto-refresh hourly)
- Check Data Collection widget for progress

### Rate limiting
- Finnhub free tier: 60 calls/minute
- Caching significantly reduces API calls
- Background collector has priority; manual refresh may serve cached data

## Architecture Decisions

### Why Three-Tier Cache?
- **Speed**: Redis and node-cache for sub-millisecond reads
- **Reliability**: TimescaleDB persistence survives restarts
- **Cost**: Minimizes expensive API calls

### Why 5m/30m/1h Resolution?
- Balances granularity with performance
- 1D: 5m gives ~78 points (smooth intraday)
- 7D: 30m gives ~91 points (daily detail)
- 30D: 1h gives ~195 points (trend clarity)

### Why Trading Days Not Calendar Days?
- Markets only open 6.5 hours/day
- Data collection only happens during market hours
- Progress reflects actual chart availability

## License

MIT License - see LICENSE file for details

## Credits

- Stock data powered by [Finnhub](https://finnhub.io)
- Time-series storage with [TimescaleDB](https://www.timescale.com)
- Built with React, Express, TypeScript, and PostgreSQL
