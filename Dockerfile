# Stage 1: Build the application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build:frontend

# Stage 2: Production image
FROM node:18-alpine AS runner
WORKDIR /app

# Install necessary runtime dependencies
RUN apk add --no-cache dumb-init

# Copy built assets from builder
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/static ./.next/static

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Set the user
RUN chown -R node:node .
USER node

# Health check - uses container's networking
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3000}/api/health || exit 1

# Start the application
CMD ["dumb-init", "node", "server.js"]
