require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('./middleware/rateLimit');
const { requestLogger, responseLogger } = require('./middleware/logging');
const routes = require('./routes');
const { PORT = 8080, NODE_ENV = 'development' } = process.env;

class ApiGateway {
  constructor() {
    this.app = express();
    this.port = PORT;
    this.env = NODE_ENV;
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddlewares() {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use(requestLogger);
    
    // Response logging
    this.app.use(responseLogger);
  }

  initializeRoutes() {
    // Apply rate limiting to all routes
    this.app.use(rateLimit.global);
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        environment: this.env,
      });
    });
    
    // Setup proxy routes
    routes.forEach(route => {
      const { path, target, rateLimit: routeRateLimit } = route;
      const proxyOptions = {
        target,
        changeOrigin: true,
        pathRewrite: { [`^${path}`]: '' },
        onProxyReq: (proxyReq, req) => {
          // Add original URL to headers
          proxyReq.setHeader('x-original-url', req.originalUrl);
          proxyReq.setHeader('x-forwarded-for', req.ip);
          
          // Add API key to headers if present
          if (req.apiKey) {
            proxyReq.setHeader('x-api-key', req.apiKey);
          }
        },
        onProxyRes: (proxyRes, req, res) => {
          // Add storage source to response headers
          proxyRes.headers['x-storage-source'] = 'api-gateway';
        },
        logLevel: this.env === 'development' ? 'debug' : 'error',
      };
      
      // Apply route-specific rate limiting if defined
      if (routeRateLimit) {
        this.app.use(path, routeRateLimit, createProxyMiddleware(proxyOptions));
      } else {
        this.app.use(path, createProxyMiddleware(proxyOptions));
      }
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        status: 'error',
        message: 'Route not found',
        path: req.originalUrl,
      });
    });
  }

  initializeErrorHandling() {
    // Error handling middleware
    this.app.use((err, req, res, next) => {
      console.error('API Gateway Error:', err);
      
      if (res.headersSent) {
        return next(err);
      }
      
      res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(this.env === 'development' && { stack: err.stack }),
      });
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`API Gateway running on port ${this.port} in ${this.env} mode`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('Unhandled Rejection:', err);
      this.server.close(() => process.exit(1));
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const apiGateway = new ApiGateway();
  apiGateway.start();
}

module.exports = ApiGateway;
