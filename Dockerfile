# Build stage - builds frontend only (backend uses tsx)
# Using Node 25 (see .nvmrc for version specification)
FROM node:25-alpine AS builder

WORKDIR /app

# Copy all package files first (for better layer caching)
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies using workspaces (single install for all)
# npm ci is faster and ensures exact versions from package-lock.json
RUN npm ci

# Copy frontend source code
COPY frontend/src ./frontend/src
COPY frontend/index.html ./frontend/
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tailwind.config.js ./frontend/
COPY frontend/postcss.config.js ./frontend/

# Build frontend (outputs to frontend/dist)
RUN npm run build --workspace=frontend

# Production stage
# Using Node 25 (see .nvmrc for version specification)
FROM node:25-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies (now includes tsx and typescript)
RUN npm ci --omit=dev

# Copy backend TypeScript source (tsx runs it directly, no build needed)
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Copy built frontend static files
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start the server using tsx (runs TypeScript directly)
CMD ["npx", "tsx", "backend/src/server.ts"]
