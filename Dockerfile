# Build stage - builds both frontend and backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy all package files first (for better layer caching)
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies using workspaces (single install for all)
# Using npm install (not ci) for fresh clones without package-lock.json
RUN npm install

# Copy source code
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY frontend/src ./frontend/src
COPY frontend/index.html ./frontend/
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tailwind.config.js ./frontend/
COPY frontend/postcss.config.js ./frontend/

# Build frontend (outputs to frontend/dist)
RUN npm run build --workspace=frontend

# Build backend (outputs to backend/dist)
RUN npm run build --workspace=backend

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only (omit dev dependencies)
# Using npm install (not ci) for fresh clones without package-lock.json
RUN npm install --omit=dev

# Copy built backend
COPY --from=builder /app/backend/dist ./backend/dist

# Copy built frontend static files
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "backend/dist/server.js"]
