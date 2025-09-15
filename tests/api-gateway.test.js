const request = require('supertest');
const express = require('express');
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const ApiGateway = require('../services/api-gateway');
const { logger } = require('../services/api-gateway/middleware/logging');

// Mock logger to avoid cluttering test output
jest.mock('../services/api-gateway/middleware/logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  requestLogger: jest.fn((req, res, next) => next()),
  responseLogger: jest.fn((req, res, next) => next()),
}));

describe('API Gateway', () => {
  let apiGateway;
  let server;
  let testServer;
  
  beforeAll(() => {
    // Create a test server that the proxy will forward to
    const testApp = express();
    testApp.use(express.json());
    
    // Test endpoints
    testApp.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'OK', service: 'test-service' });
    });
    
    testApp.post('/api/data', (req, res) => {
      res.status(201).json({ id: 1, ...req.body });
    });
    
    // Start the test server
    testServer = testApp.listen(3001);
  });
  
  afterAll((done) => {
    // Close the test server
    testServer.close(done);
  });
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Set up environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.API_SERVICE_URL = 'http://localhost:3001';
  });
  
  afterEach(() => {
    // Clean up after each test
    if (apiGateway) {
      apiGateway.stop();
    }
  });
  
  describe('Health Check', () => {
    it('should return 200 and status UP for /health', async () => {
      apiGateway = new ApiGateway();
      const app = apiGateway.app;
      
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('service', 'api-gateway');
    });
  });
  
  describe('Request Forwarding', () => {
    it('should forward requests to the target service', async () => {
      apiGateway = new ApiGateway();
      const app = apiGateway.app;
      apiGateway.start();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('service', 'test-service');
    });
    
    it('should forward request body to the target service', async () => {
      apiGateway = new ApiGateway();
      const app = apiGateway.app;
      apiGateway.start();
      
      const testData = { name: 'Test', value: 123 };
      const response = await request(app)
        .post('/api/data')
        .send(testData)
        .expect(201);
      
      expect(response.body).toMatchObject(testData);
      expect(response.body).toHaveProperty('id');
    });
  });
  
  describe('Rate Limiting', () => {
    it('should apply global rate limiting', async () => {
      // Override rate limiting for testing
      jest.mock('../services/api-gateway/middleware/rateLimit', () => ({
        global: (req, res, next) => {
          // Simulate rate limit exceeded
          if (req.get('X-Test-RateLimit') === 'exceeded') {
            return res.status(429).json({ 
              status: 'error', 
              message: 'Too many requests' 
            });
          }
          next();
        },
        apiKey: (req, res, next) => next(),
        createRouteRateLimiter: () => (req, res, next) => next(),
      }));
      
      // Clear the require cache to use the mock
      delete require.cache[require.resolve('../services/api-gateway/index')];
      const MockedApiGateway = require('../services/api-gateway');
      
      apiGateway = new MockedApiGateway();
      const app = apiGateway.app;
      
      // Test rate limit exceeded
      const response = await request(app)
        .get('/api/health')
        .set('X-Test-RateLimit', 'exceeded')
        .expect(429);
      
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'Too many requests');
    });
  });
  
  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      apiGateway = new ApiGateway();
      const app = apiGateway.app;
      
      const response = await request(app)
        .get('/nonexistent-route')
        .expect(404);
      
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'Route not found');
    });
    
    it('should handle proxy errors gracefully', async () => {
      // Create a mock proxy that always fails
      jest.mock('http-proxy-middleware', () => () => (req, res, next) => {
        const error = new Error('Proxy error');
        error.code = 'ECONNREFUSED';
        next(error);
      });
      
      // Clear the require cache to use the mock
      delete require.cache[require.resolve('../services/api-gateway/index')];
      const MockedApiGateway = require('../services/api-gateway');
      
      apiGateway = new MockedApiGateway();
      const app = apiGateway.app;
      
      const response = await request(app)
        .get('/api/health')
        .expect(502);
      
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message');
    });
  });
  
  describe('Logging', () => {
    it('should log requests and responses', async () => {
      const { requestLogger, responseLogger } = require('../services/api-gateway/middleware/logging');
      
      apiGateway = new ApiGateway();
      const app = apiGateway.app;
      
      await request(app).get('/health');
      
      expect(requestLogger).toHaveBeenCalled();
      expect(responseLogger).toHaveBeenCalled();
      
      // Check if logger.info was called with the expected arguments
      expect(logger.info).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining({
          method: 'GET',
          url: '/health'
        })
      );
    });
  });
});
