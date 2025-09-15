const { createRouteRateLimiter } = require('../middleware/rateLimit');

// Route configuration
const routes = [
  // API Service
  {
    path: '/api',
    target: process.env.API_SERVICE_URL || 'http://localhost:3001',
    rateLimit: createRouteRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests to the API service, please try again later',
    }),
  },
  
  // Frontend Service
  {
    path: '/',
    target: process.env.FRONTEND_SERVICE_URL || 'http://localhost:3000',
    rateLimit: createRouteRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // Higher limit for frontend assets
    }),
  },
  
  // Authentication Service (example)
  {
    path: '/auth',
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
    rateLimit: createRouteRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // Stricter limit for auth endpoints
    }),
  },
];

module.exports = routes;
