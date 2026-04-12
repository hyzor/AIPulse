# AIPulse Deployment Guide

## Quick Start with Docker Compose

AIPulse now uses a three-tier persistent cache architecture with TimescaleDB and Redis. Use the provided Docker Compose files for easy deployment.

### Development Mode (Local)

For local development with hot-reload and database services:

```bash
# 1. Configure environment (single .env file for both backend and frontend)
cp .env.example .env
# Edit .env and add your FINNHUB_API_KEY

# 2. Start infrastructure services (TimescaleDB + Redis)
docker compose -f docker-compose.dev.yml up -d

# 3. In another terminal, start the backend
cd backend
npm install
npm run dev

# 4. In another terminal, start the frontend
cd frontend
npm install
npm run dev
```

**Services in dev mode:**
- TimescaleDB on port 5432
- Redis on port 6379
- Backend on port 3001 (local, hot-reload) → http://localhost:3001
- Frontend on port 5173 (local, hot-reload) → http://localhost:5173

**Access the app in dev mode:**
Open http://localhost:5173 in your browser (Vite dev server with hot reload)

### Production Mode (Full Stack)

For production deployment with all services containerized:

```bash
# Create .env file with your API key
echo "FINNHUB_API_KEY=your_api_key_here" > .env

# Start all services (build first if code changed)
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop services
docker compose -f docker-compose.prod.yml down
```

> ⚠️ **Important:** The `--build` flag ensures the image is rebuilt with your latest code.
> Without it, Docker uses the cached image from previous runs.

**Services in production mode:**
- AIPulse app on **port 3001** → http://localhost:3001
- TimescaleDB on port 5432 (internal only)
- Redis on port 6379 (internal only)

## Production Deployment Options

### Option 1: Docker Compose (Recommended for Home Lab)

1. **Clone and setup:**
```bash
git clone https://github.com/yourusername/aipulse.git
cd aipulse
```

2. **Configure environment:**
   > **Note:** Docker Compose automatically loads environment variables from `.env` in the project root.
   ```bash
   cp .env.example .env
   # Edit .env and add your FINNHUB_API_KEY
   ```

3. **Deploy with Docker Compose:**
```bash
docker compose -f docker-compose.prod.yml up -d
```

4. **Access the app:**
   Open http://localhost:3001 in your browser

5. **Verify deployment:**
```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f app

# Test API
curl http://localhost:3001/api/health
```

6. **Update deployment (after code changes):**
```bash
# Pull latest changes
git pull

# IMPORTANT: Always use --build to rebuild with new code
docker compose -f docker-compose.prod.yml up -d --build

# Or if you want to clean restart:
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

> **Why `--build` is required:** Docker caches images. Without `--build`, your changes won't be included.

### Option 2: Manual Docker Build

1. **Build the Docker image:**
```bash
docker build -t aipulse:latest .
```

2. **Run with external database:**
```bash
docker run -d \
  --name aipulse \
  -p 3001:3001 \
  -e FINNHUB_API_KEY=your_api_key \
  -e DATABASE_URL=postgresql://user:pass@host:5432/aipulse \
  -e REDIS_URL=redis://host:6379 \
  aipulse:latest
```

### Option 3: Using PM2 (Node.js Process Manager)

For running without Docker (requires manual TimescaleDB and Redis setup):

1. **Install PM2:**
```bash
npm install -g pm2
```

2. **Setup database services:**
   - Install TimescaleDB locally or use cloud service
   - Install Redis locally or use cloud service

3. **Configure environment:**
   > **Note:** Docker Compose automatically loads environment variables from a `.env` file in the project root.
   ```bash
   cp .env.example .env
   # Edit .env and add your FINNHUB_API_KEY
   ```

4. **Start with PM2:**
```bash
pm2 start ecosystem.config.js
```

5. **Save PM2 config:**
```bash
pm2 save
pm2 startup
```

### Option 4: Using Systemd

1. **Setup database services** (TimescaleDB + Redis)

2. **Copy service file:**
```bash
sudo cp deployment/aipulse.service /etc/systemd/system/
sudo systemctl daemon-reload
```

3. **Configure environment variables** in the service file or use EnvironmentFile

4. **Enable and start:**
```bash
sudo systemctl enable aipulse
sudo systemctl start aipulse
```

## Database Persistence

### Volume Management

Data is persisted in Docker volumes:

```bash
# List volumes
docker volume ls | grep aipulse

# Backup TimescaleDB
docker exec aipulse-db pg_dump -U aipulse aipulse > backup.sql

# Restore TimescaleDB
cat backup.sql | docker exec -i aipulse-db psql -U aipulse

# Backup Redis
docker exec aipulse-redis redis-cli BGSAVE
docker cp aipulse-redis:/data/dump.rdb ./redis-backup.rdb
```

### Database Migrations

The application automatically runs migrations on startup. To manually trigger:

```bash
docker exec -i aipulse-db psql -U aipulse -d aipulse < backend/src/db/init.sql
```

## Environment Variables

### Required
- `FINNHUB_API_KEY` - Your Finnhub API key (get free at https://finnhub.io)

### Database (auto-configured in Docker, manual for PM2/Systemd)
- `DATABASE_URL` - PostgreSQL/TimescaleDB connection string
- `REDIS_URL` - Redis connection string

### Optional
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Frontend URL for CORS (default: http://localhost:5173)
- `CACHE_TTL_SECONDS` - API cache time-to-live (default: 60)
- `CANDLE_BUFFER_FLUSH_INTERVAL_MS` - Candle aggregation interval (default: 60000)
- `REDIS_PERSISTENCE_INTERVAL_MS` - Redis save interval (default: 300000)
- `PRE_CACHE_INTERVAL_MS` - Background refresh interval (default: 120000)

## Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## SSL with Let's Encrypt

```bash
certbot --nginx -d your-domain.com
```

## Rebuilding After Code Changes

Docker caches images to speed up deployments. This means **your code changes won't be included** unless you explicitly rebuild.

### Standard Update Workflow

When pulling changes and redeploying:

```bash
# 1. Pull latest code
git pull

# 2. Rebuild and restart (this is the crucial step!)
docker compose -f docker-compose.prod.yml up -d --build

# 3. Verify it's running
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3001/api/health
```

### Why `--build` is Essential

| Command | Rebuilds Image? | Code Changes Applied? |
|---------|-----------------|----------------------|
| `docker compose up -d` | ❌ No | ❌ No (uses cached image) |
| `docker compose up -d --build` | ✅ Yes | ✅ Yes (fresh build) |

### Forcing a Clean Rebuild

If you suspect cache issues or want a completely fresh build:

```bash
# Stop and remove containers + volumes
docker compose -f docker-compose.prod.yml down -v

# Remove old images to force rebuild
docker rmi aipulse-aipulse:latest

# Build from scratch
docker compose -f docker-compose.prod.yml up -d --build --no-cache
```

### Checking What Version is Running

```bash
# See image creation date
docker inspect aipulse-aipulse:latest | grep -i created

# Check git commit in container (if exposed via API)
curl http://localhost:3001/api/health
```

## Monitoring & Health Checks

### Health Endpoints

- `GET /api/health` - Overall system health (DB, Redis, Finnhub)
- `GET /api/rate-limit` - Current API rate limit status

### Docker Health Checks

The production compose file includes health checks:
- App: HTTP check on `/api/health`
- DB: PostgreSQL connection check
- Redis: Redis ping check

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f db
docker compose -f docker-compose.prod.yml logs -f redis
```

## Troubleshooting

### Container fails to start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs app

# Verify environment variables
docker compose -f docker-compose.prod.yml config
```

### Database connection issues

```bash
# Check if DB is ready
docker compose -f docker-compose.prod.yml exec db pg_isready

# Reset database (WARNING: destroys data)
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

### Rate limit issues

Check rate limit status:
```bash
curl http://localhost:3001/api/rate-limit
```

If consistently hitting limits:
- Reduce `PRE_CACHE_INTERVAL_MS` in environment
- Check if other apps are using the same API key
- Consider upgrading to paid Finnhub tier

## Cloud Deployment

### Vercel (Frontend Only)

For frontend-only deployment (backend runs separately):

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Login and deploy:**
```bash
vercel login
vercel --prod
```

3. **Set API URL:**
```bash
vercel env add VITE_API_URL
# Set to your backend URL, e.g., https://api.your-domain.com
```

### Railway / Render / Fly.io

1. Push code to GitHub
2. Connect repository to platform
3. Set environment variables in dashboard
4. Deploy

**Note:** For full-stack deployment, ensure the platform supports:
- PostgreSQL/TimescaleDB (or use managed database)
- Redis (or use managed cache)
- WebSocket support

## Security Considerations

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Use strong database passwords** in production
3. **Enable SSL** for production deployments
4. **Restrict CORS** to your actual domain in production
5. **Rate limiting** is handled internally (60 calls/min for Finnhub free tier)

## Updating

### Docker Compose Update

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml pull  # If using pre-built images
docker compose -f docker-compose.prod.yml up -d --build
```

### Zero-Downtime Update (Advanced)

```bash
# Build new image
docker build -t aipulse:new .

# Start new container alongside old
docker compose -f docker-compose.prod.yml up -d --scale app=2

# Verify new container works
curl http://localhost:3001/api/health

# Remove old container
docker compose -f docker-compose.prod.yml up -d --scale app=1
```
