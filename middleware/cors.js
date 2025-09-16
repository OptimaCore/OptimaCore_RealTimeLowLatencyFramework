const { logger } = require('../services/telemetry');

/**
 * CORS middleware with security best practices
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware function
 */
const cors = (options = {}) => {
  // Default CORS configuration
  const defaults = {
    // Allowed origins (use process.env.ALLOWED_ORIGINS for production)
    origins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    
    // Allowed methods
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    
    // Allowed headers
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Api-Key',
      'X-Request-ID'
    ],
    
    // Exposed headers
    exposedHeaders: [
      'Content-Length',
      'Content-Type',
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    
    // Credentials
    credentials: true,
    
    // Max age in seconds for preflight requests
    maxAge: 600, // 10 minutes
    
    // Enable CORS for all routes by default
    preflightContinue: false,
    
    // Success status for OPTIONS requests
    optionsSuccessStatus: 204
  };

  // Merge defaults with provided options
  const config = { ...defaults, ...options };

  return (req, res, next) => {
    const origin = req.headers.origin;
    const requestMethod = req.method;
    const requestHeaders = req.headers['access-control-request-headers'];

    // Check if the origin is allowed
    const isOriginAllowed = config.origins.includes('*') || 
      (origin && config.origins.some(allowedOrigin => {
        const regex = new RegExp(allowedOrigin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
        return regex.test(origin);
      }));

    // Handle preflight requests
    if (requestMethod === 'OPTIONS' && req.headers['access-control-request-method']) {
      // If origin is not allowed, return 403
      if (!isOriginAllowed) {
        logger.warn('CORS: Origin not allowed', { origin });
        return res.status(403).end();
      }

      // Set CORS headers for preflight
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', config.methods.join(','));
      res.setHeader('Access-Control-Allow-Headers', requestHeaders || config.allowedHeaders.join(','));
      res.setHeader('Access-Control-Allow-Credentials', String(config.credentials));
      res.setHeader('Access-Control-Max-Age', String(config.maxAge));
      
      // Add exposed headers
      if (config.exposedHeaders.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(','));
      }

      // End the preflight request
      return res.status(config.optionsSuccessStatus).end();
    }

    // For actual requests
    if (isOriginAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin || config.origins[0]);
      res.setHeader('Access-Control-Allow-Credentials', String(config.credentials));
      
      // Add exposed headers
      if (config.exposedHeaders.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(','));
      }

      // Log CORS access
      logger.debug('CORS: Allowed request', {
        origin,
        method: requestMethod,
        path: req.path
      });
    } else if (origin) {
      // Log blocked CORS requests
      logger.warn('CORS: Blocked request from unauthorized origin', {
        origin,
        method: requestMethod,
        path: req.path
      });
      
      // Return 403 for blocked origins
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cross-origin requests are not allowed from this origin.',
        code: 'CORS_NOT_ALLOWED'
      });
    }

    // Continue to the next middleware
    next();
  };
};

/**
 * Middleware to handle CORS preflight requests
 */
cors.preflight = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
};

module.exports = cors;
