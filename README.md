# AIPulse

A real-time AI stock monitoring web application featuring dark theme UI, server-side caching, and WebSocket-based live updates.

![AIPulse](https://img.shields.io/badge/AIPulse-AI%20Stock%20Monitor-blue)
![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)

## Features

- **Real-time Updates**: WebSocket-based live price updates
- **Server-side Caching**: Reduces API calls with intelligent caching
- **Auto-refresh**: Automatic data refresh every 30 seconds
- **Dark Theme**: Modern dark UI with neon accents
- **Categorized Stocks**: Organized by AI Chips, Semiconductors, AI Software, Tech Giants
- **Responsive Design**: Works on desktop, tablet, and mobile

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

## Tech Stack

### Backend
- **Node.js** 20+
- **Express** - Web framework
- **TypeScript** - Type safety
- **WebSocket** - Real-time communication
- **node-cache** - Server-side caching
- **Finnhub API** - Stock data provider

### Frontend
- **React** 18 - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Recharts** - Data visualization (ready for expansion)

## Quick Start

### Prerequisites
- Node.js 20 or higher
- npm or yarn
- Finnhub API key (free at [finnhub.io](https://finnhub.io))

### 1. Clone and Install

```bash
git clone <repository-url>
cd AIPulse
npm install
```

### 2. Configure Environment

Backend:
```bash
cd backend
cp .env.example .env
# Edit .env and add your FINNHUB_API_KEY
```

Frontend:
```bash
cd frontend
cp .env.example .env
# Default values should work for local development
```

### 3. Start Development

From the root directory:
```bash
npm run dev
```

This starts:
- Backend at http://localhost:3001
- Frontend at http://localhost:5173

## Development

### Backend Commands
```bash
cd backend
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Run compiled server
npm run typecheck    # Check types
```

### Frontend Commands
```bash
cd frontend
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run typecheck    # Check types
```

### Testing the Three-Tier Cache

To verify the persistence system works (data survives restarts):

```bash
# 1. Start databases
docker-compose -f docker-compose.dev.yml up -d

# 2. Start backend (keep running)
cd backend && npm run dev

# 3. In another terminal, run tests
.\scripts\test-persistence.ps1        # Windows
./scripts/test-persistence.sh         # Linux/Mac
```

**See [Testing Guide](docs/testing-guide.md) for detailed documentation.**

## Project Structure

```
AIPulse/
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic & caching
│   │   ├── types/          # TypeScript types
│   │   └── server.ts       # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API clients
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Helper functions
│   │   ├── App.tsx         # Main app
│   │   └── main.tsx        # Entry point
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── deployment/             # Deployment configs
├── docker-compose.yml
├── Dockerfile
├── ecosystem.config.js     # PM2 config
└── package.json            # Root workspace config
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stocks` | GET | Get all tracked stocks |
| `/api/stocks/:symbol` | GET | Get specific stock quote |
| `/api/profile/:symbol` | GET | Get company profile |
| `/api/health` | GET | Health check |
| `/api/cache/clear` | POST | Clear server cache |
| `/ws` | WebSocket | Real-time updates |

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
    ...
  }
}
```

## Deployment

### Option 1: Home Lab Server

Using Docker Compose:
```bash
docker-compose up -d
```

Using PM2:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions including:
- Docker setup
- Systemd service
- Nginx reverse proxy
- SSL with Let's Encrypt

### Option 2: Vercel

```bash
npm i -g vercel
vercel --prod
```

Set environment variables:
```bash
vercel env add FINNHUB_API_KEY
```

## Environment Variables

### Backend (.env)
```
PORT=3001
FINNHUB_API_KEY=your_finnhub_api_key_here
CORS_ORIGIN=http://localhost:5173
CACHE_TTL_SECONDS=60
```

### Frontend (.env)
```
VITE_API_URL=              # Empty for proxy
VITE_WS_URL=ws://localhost:3001/ws
```

## Data Flow

```
┌─────────────────┐     WebSocket      ┌──────────────┐
│   Finnhub API   │◄───────────────────►│   Backend    │
│   (External)    │                     │   (Cache)    │
└─────────────────┘                     └──────┬───────┘
       ▲                                       │
       │ HTTP (fallback)                       │ WebSocket
       │                                       │
       │                              ┌────────▼───────┐
       │                              │   Frontend     │
       └──────────────────────────────┤   (React)      │
                                      └────────────────┘
```

## Troubleshooting

### No data loading
- Check that `FINNHUB_API_KEY` is set correctly
- Verify backend is running: `curl http://localhost:3001/api/health`
- Check browser console for CORS errors

### WebSocket not connecting
- Ensure port 3001 is not blocked by firewall
- Check that `VITE_WS_URL` matches backend URL
- Try refreshing the page

### Rate limiting
- Finnhub free tier allows 60 calls/minute
- Caching reduces API calls significantly
- Increase `CACHE_TTL_SECONDS` if needed

## License

MIT License - see LICENSE file for details

## Credits

- Stock data powered by [Finnhub](https://finnhub.io)
- Built with React, Express, and TypeScript
