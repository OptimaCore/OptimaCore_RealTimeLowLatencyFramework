# Docker Setup and Deployment

This document provides instructions for setting up and running the OptimaCore application using Docker.

## Prerequisites

- Docker Engine 20.10.0 or higher
- Docker Compose 2.0.0 or higher
- Node.js 18+ (for local development without Docker)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/OptimaCore/OptimaCore_RealTimeLowLatencyFramework.git
   cd OptimaCore_RealTimeLowLatencyFramework
   ```

2. **Start the application**
   ```bash
   # Start all services
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3001
   - Adminer (Database GUI): http://localhost:8080
   - Redis Commander: http://localhost:8081

## Available Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js application |
| API | 3001 | Node.js API server |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching layer |
| Adminer | 8080 | Database management UI |
| Redis Commander | 8081 | Redis management UI |

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# API Configuration
NODE_ENV=development
PORT=3001

# Database Configuration
POSTGRES_USER=optima
POSTGRES_PASSWORD=optima123
POSTGRES_DB=optima_db
DATABASE_URL=postgresql://optima:optima123@postgres:5432/optima_db

# Redis Configuration
REDIS_URL=redis://:optima123@redis:6379
REDIS_PASSWORD=optima123

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Building Docker Images

### Development

```bash
# Build all services
npm run docker:build

# Start all services
npm run docker:up
```

### Production

```bash
# Set version (optional, defaults to 'latest')
export VERSION=1.0.0

# Build and tag images
npm run docker:build

# Push images to registry
npm run docker:push

# Deploy using your orchestration tool (Kubernetes, ECS, etc.)
```

## Managing Services

```bash
# Start services in detached mode
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild and restart a specific service
docker-compose up -d --build <service_name>

# Access a running container
docker-compose exec <service_name> sh
```

## Health Checks

- Frontend Health: http://localhost:3000/api/health
- API Health: http://localhost:3001/health
- API Ping: http://localhost:3001/ping

## Troubleshooting

### Common Issues

1. **Port conflicts**
   - Ensure no other services are using ports 3000, 3001, 5432, 6379, 8080, 8081
   - Update ports in `docker-compose.yml` if needed

2. **Database connection issues**
   - Verify PostgreSQL is running: `docker-compose ps postgres`
   - Check logs: `docker-compose logs postgres`
   - Test connection: `docker-compose exec postgres psql -U optima -d optima_db -c "SELECT 1"`

3. **Redis connection issues**
   - Verify Redis is running: `docker-compose ps redis`
   - Test connection: `docker-compose exec redis redis-cli ping`

4. **Build failures**
   - Clear Docker cache: `docker system prune -f`
   - Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Cleaning Up

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove all unused containers, networks, images, and build cache
docker system prune -a --volumes
```

## Production Deployment

For production deployments, consider the following:

1. Use environment-specific configuration files (e.g., `docker-compose.prod.yml`)
2. Set up proper secrets management
3. Configure HTTPS/TLS termination
4. Set up monitoring and logging
5. Implement backup and disaster recovery procedures

## Security Considerations

- Change default credentials in production
- Use proper network segmentation
- Enable TLS for all services
- Regularly update Docker images
- Follow the principle of least privilege

## Monitoring

Monitor the health and performance of your containers:

```bash
# View container stats
docker stats

# View logs for all services
docker-compose logs -f

# Check container health
docker ps --format "{{.Names}}: {{.Status}}"
```

## Scaling

To scale services:

```bash
# Scale API service to 3 instances
docker-compose up -d --scale api=3

# Scale worker services
docker-compose up -d --scale worker=5
```

## Backup and Restore

### PostgreSQL Backup

```bash
# Create a backup
docker-compose exec -T postgres pg_dump -U optima optima_db > backup.sql

# Restore from backup
cat backup.sql | docker-compose exec -T postgres psql -U optima optima_db
```

### Redis Backup

```bash
# Create a backup
docker-compose exec redis redis-cli SAVE
```

## Updating the Application

1. Pull the latest changes
2. Rebuild the services
3. Restart the containers

```bash
git pull
npm run docker:build
docker-compose up -d --build
```
