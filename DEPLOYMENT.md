# AIPulse Deployment Guide

## Option 1: Home Lab Server Deployment

### Using Docker (Recommended)

1. **Build the Docker image**:
```bash
docker build -t aipulse:latest .
```

2. **Run the container**:
```bash
docker run -d \
  --name aipulse \
  -p 3001:3001 \
  -e FINNHUB_API_KEY=your_api_key \
  -e PORT=3001 \
  aipulse:latest
```

### Using Docker Compose

```bash
docker-compose up -d
```

### Using PM2 (Node.js Process Manager)

1. **Install PM2**:
```bash
npm install -g pm2
```

2. **Start with PM2**:
```bash
pm2 start ecosystem.config.js
```

3. **Save PM2 config**:
```bash
pm2 save
pm2 startup
```

### Using Systemd

1. **Copy service file**:
```bash
sudo cp deployment/aipulse.service /etc/systemd/system/
sudo systemctl daemon-reload
```

2. **Enable and start**:
```bash
sudo systemctl enable aipulse
sudo systemctl start aipulse
```

## Option 2: Vercel Deployment

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Login to Vercel**:
```bash
vercel login
```

3. **Deploy**:
```bash
vercel --prod
```

4. **Set environment variables**:
```bash
vercel env add FINNHUB_API_KEY
```

Or use the Vercel dashboard to set environment variables.

## Environment Variables

Required:
- `FINNHUB_API_KEY` - Your Finnhub API key (get free at https://finnhub.io)

Optional:
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Frontend URL for CORS
- `CACHE_TTL_SECONDS` - Cache time-to-live (default: 60)

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
    }
}
```

## SSL with Let's Encrypt

```bash
certbot --nginx -d your-domain.com
```
