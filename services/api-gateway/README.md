# API Gateway

The API Gateway is the single entry point for all client requests to the OptimaCore platform. It handles request routing, rate limiting, authentication, and logging.

## Features

- **Request Routing**: Routes requests to appropriate microservices
- **Rate Limiting**: Protects against abuse with IP and API key based rate limiting
- **Logging**: Comprehensive request/response logging with Winston
- **Health Checks**: Built-in health check endpoints
- **Security**: CORS, request validation, and API key authentication
- **Load Balancing**: Can be scaled horizontally behind a load balancer

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Docker (for containerized deployment)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. Update the `.env` file with your configuration

### Running Locally

```bash
# Development mode with hot-reload
npm run dev

# Production mode
npm start
```

### Running with Docker

```bash
# Build the Docker image
docker build -t optima-gateway -f services/api-gateway/Dockerfile .

# Run the container
docker run -p 8080:8080 --env-file services/api-gateway/.env optima-gateway
```

Or use Docker Compose:

```bash
docker-compose up -d api-gateway
```

## Configuration

Configure the API Gateway using environment variables. See `.env.example` for all available options.

## API Documentation

### Health Check

```
GET /health
```

**Response**
```json
{
  "status": "UP",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "service": "api-gateway",
  "environment": "development"
}
```

### Rate Limiting

The API Gateway implements rate limiting to prevent abuse:

- **Global Rate Limit**: 100 requests per 15 minutes per IP
- **API Key Rate Limit**: 1000 requests per minute per API key
- **Route-Specific Limits**: Can be configured in `routes/index.js`

### Authentication

Include your API key in the `X-API-Key` header for authenticated requests.

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run API Gateway tests only
npm run test:gateway

# Run tests with coverage
npm run test:coverage
```

## Deployment

The API Gateway is designed to be deployed in a containerized environment. It can be scaled horizontally behind a load balancer.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the gateway will listen on |
| `NODE_ENV` | `development` | Runtime environment |
| `API_SERVICE_URL` | `http://localhost:3001` | URL of the API service |
| `FRONTEND_SERVICE_URL` | `http://localhost:3000` | URL of the frontend service |
| `AUTH_SERVICE_URL` | `http://localhost:3002` | URL of the auth service |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_TO_FILE` | `false` | Enable file logging |
| `TRUST_PROXY` | `1` | Trust proxy headers |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins | CORS configuration |
| `API_KEYS` | Comma-separated list of valid API keys | API key authentication |

## Monitoring

The API Gateway exposes the following metrics:

- Request count
- Response times
- Error rates
- Rate limit hits

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
