# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY services/api-gateway/package*.json ./services/api-gateway/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Remove devDependencies
RUN npm prune --production

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/api-gateway ./services/api-gateway

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port the app runs on
EXPOSE 8080

# Set the working directory to the API Gateway
WORKDIR /app/services/api-gateway

# Create a non-root user
RUN addgroup -S optima && adduser -S optima -G optima
RUN chown -R optima:optima /app
USER optima

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

# Start the application
CMD ["node", "index.js"]
