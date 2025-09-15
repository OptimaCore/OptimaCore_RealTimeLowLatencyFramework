const express = require('express');
const { appInsights } = require('../monitoring/app-insights');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

class HealthService {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3000;
    this.app = express();
    this.server = null;
    this.components = new Map();
    this.startTime = new Date();
    this.requestCount = 0;
    
    // Default components
    this.registerComponent('app', () => this.checkAppHealth());
    this.registerComponent('memory', () => this.checkMemoryHealth());
    
    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  setupMiddleware() {
    // Request logging
    this.app.use((req, res, next) => {
      const requestId = req.headers['x-request-id'] || uuidv4();
      const startTime = process.hrtime();
      
      res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const durationMs = (seconds * 1000) + (nanoseconds / 1e6);
        
        // Track request metrics
        appInsights.trackRequest({
          name: `${req.method} ${req.path}`,
          url: req.originalUrl,
          duration: durationMs,
          resultCode: res.statusCode,
          success: res.statusCode < 400,
          properties: {
            requestId,
            method: req.method,
            path: req.path,
            userAgent: req.get('user-agent'),
            ip: req.ip
          }
        });
        
        console.log(`${new Date().toISOString()} [${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(2)}ms`);
      });
      
      // Add request ID to response headers
      res.setHeader('X-Request-ID', requestId);
      next();
    });
    
    // JSON body parsing
    this.app.use(express.json());
  }
  
  setupRoutes() {
    // Health endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.getHealthStatus();
        const status = health.status === 'healthy' ? 200 : 503;
        
        res.status(status).json(health);
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Readiness endpoint
    this.app.get('/ready', async (req, res) => {
      try {
        const health = await this.getReadinessStatus();
        const status = health.status === 'ready' ? 200 : 503;
        
        res.status(status).json(health);
      } catch (error) {
        console.error('Readiness check failed:', error);
        res.status(500).json({
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', (req, res) => {
      const metrics = [
        '# HELP http_requests_total Total number of HTTP requests',
        '# TYPE http_requests_total counter',
        `http_requests_total ${this.requestCount}`,
        '',
        '# HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.',
        '# TYPE process_cpu_seconds_total counter',
        `process_cpu_seconds_total ${process.cpuUsage().user / 1e6 + process.cpuUsage().system / 1e6}`,
        '',
        '# HELP process_resident_memory_bytes Resident memory size in bytes.',
        '# TYPE process_resident_memory_bytes gauge',
        `process_resident_memory_bytes ${process.memoryUsage().rss}`,
        '',
        '# HELP nodejs_heap_used_bytes Process heap usage from node.js in bytes.',
        '# TYPE nodejs_heap_used_bytes gauge',
        `nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`,
        '',
        '# HELP nodejs_heap_total_bytes Process heap size from node.js in bytes.',
        '# TYPE nodejs_heap_total_bytes gauge',
        `nodejs_heap_total_bytes ${process.memoryUsage().heapTotal}`
      ];
      
      res.set('Content-Type', 'text/plain').send(metrics.join('\n'));
    });
    
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        status: 'error',
        message: 'Not Found',
        path: req.path
      });
    });
    
    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Request error:', err);
      
      res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  }
  
  // Register a health check component
  registerComponent(name, checkFunction) {
    this.components.set(name, checkFunction);
    return this;
  }
  
  // Check application health
  async checkAppHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown',
      node: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      env: process.env.NODE_ENV || 'development'
    };
  }
  
  // Check memory health
  checkMemoryHealth() {
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    
    return {
      status: memoryUsage < 90 ? 'healthy' : 'degraded',
      free: freeMemory,
      total: totalMemory,
      used: usedMemory,
      usagePercent: memoryUsage,
      threshold: 90
    };
  }
  
  // Get overall health status
  async getHealthStatus() {
    const checks = {};
    let allHealthy = true;
    let allReady = true;
    
    // Run all health checks in parallel
    const checkPromises = [];
    for (const [name, check] of this.components.entries()) {
      checkPromises.push(
        Promise.resolve()
          .then(() => check())
          .then(result => {
            checks[name] = {
              status: 'healthy',
              ...result
            };
          })
          .catch(error => {
            console.error(`Health check failed for ${name}:`, error);
            checks[name] = {
              status: 'unhealthy',
              error: error.message,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            };
            allHealthy = false;
          })
      );
    }
    
    await Promise.all(checkPromises);
    
    // Determine overall status
    const status = allHealthy ? 'healthy' : 'degraded';
    
    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      meta: {
        node: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        pid: process.pid,
        uptime: process.uptime(),
        startTime: this.startTime.toISOString(),
        hostname: os.hostname(),
        env: process.env.NODE_ENV || 'development'
      }
    };
  }
  
  // Get readiness status (similar to health but with different thresholds)
  async getReadinessStatus() {
    const health = await this.getHealthStatus();
    const isReady = health.status === 'healthy';
    
    return {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: health.checks,
      meta: health.meta
    };
  }
  
  // Start the health service
  start(callback) {
    this.server = this.app.listen(this.port, () => {
      console.log(`Health service running on port ${this.port}`);
      
      // Register shutdown handlers
      this.registerShutdownHandlers();
      
      if (callback) callback();
    });
    
    return this.server;
  }
  
  // Stop the health service
  stop(callback) {
    if (!this.server) {
      if (callback) process.nextTick(callback);
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      this.server.close(() => {
        this.server = null;
        if (callback) callback();
        resolve();
      });
    });
  }
  
  // Register shutdown handlers
  registerShutdownHandlers() {
    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      
      try {
        // Flush any pending metrics
        await appInsights.flush();
        
        // Close the server
        await this.stop();
        
        console.log('Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    // Handle signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      appInsights.trackException({
        exception: error,
        properties: {
          type: 'uncaughtException'
        }
      });
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      appInsights.trackException({
        exception: reason instanceof Error ? reason : new Error(String(reason)),
        properties: {
          type: 'unhandledRejection'
        }
      });
    });
  }
}

// Create a singleton instance
const healthService = new HealthService();

// Export the singleton instance and the class
module.exports = {
  HealthService,
  healthService,
  
  // Convenience methods that use the singleton instance
  registerComponent: (name, checkFunction) => 
    healthService.registerComponent(name, checkFunction),
    
  getHealthStatus: () => healthService.getHealthStatus(),
  getReadinessStatus: () => healthService.getReadinessStatus(),
  
  start: (port, callback) => {
    if (port) healthService.port = port;
    return healthService.start(callback);
  },
  
  stop: (callback) => healthService.stop(callback)
};

// Auto-start if this is the main module
if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 3000;
  healthService.start(() => {
    console.log(`Health service started on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Readiness check: http://localhost:${port}/ready`);
    console.log(`Metrics: http://localhost:${port}/metrics`);
  });
}
