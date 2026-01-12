# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ../shared/package*.json ./shared/

# Install dependencies
RUN npm ci --workspace=@nzr-dev/relay-server

# Copy source
COPY shared/ ./shared/
COPY relay-server/ ./relay-server/

# Build
WORKDIR /app/shared
RUN npm run build

WORKDIR /app/relay-server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built files
COPY --from=builder /app/relay-server/dist ./dist
COPY --from=builder /app/relay-server/package*.json ./
COPY --from=builder /app/shared/dist ./node_modules/@nzr-dev/shared/dist
COPY --from=builder /app/shared/package.json ./node_modules/@nzr-dev/shared/

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["node", "dist/index.js"]
