# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci

# Copy source code
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

# Build backend
RUN cd backend && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --only=production && cd backend && npm ci --only=production

# Copy built files
COPY --from=builder /app/backend/dist ./backend/dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start the server
CMD ["node", "backend/dist/server.js"]
