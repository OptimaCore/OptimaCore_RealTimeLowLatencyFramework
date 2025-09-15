const rateLimit = require('express-rate-limit');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// In-memory store for rate limiting (consider Redis for production)
const rateLimiterMemory = new RateLimiterMemory({
  points: 100, // 100 points
  duration: 60, // Per 60 seconds per IP
  blockDuration: 60 * 5, // Block for 5 minutes if limit is exceeded
});

// Rate limiter by IP
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later',
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      status: 'error',
      message: options.message,
      retryAfter: req.rateLimit.resetTime - Date.now(),
    });
  },
});

// Rate limiter by API key
const apiKeyRateLimiter = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // Skip rate limiting if no API key is provided
  if (!apiKey) return next();
  
  // Use API key as the unique identifier
  const key = `api-key:${apiKey}`;
  
  rateLimiterMemory.consume(key, 1)
    .then((rateLimiterRes) => {
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': rateLimiterMemory.points,
        'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-RateLimit-Reset': Math.ceil(rateLimiterRes.msBeforeNext / 1000),
      });
      
      // Store API key in request for later use
      req.apiKey = apiKey;
      next();
    })
    .catch((rateLimiterRes) => {
      // Rate limit exceeded
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later',
        retryAfter,
      });
    });
};

// Route-specific rate limiting
const createRouteRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Max requests per windowMs
    message = 'Too many requests, please try again later',
  } = options;
  
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  global: globalRateLimiter,
  apiKey: apiKeyRateLimiter,
  createRouteRateLimiter,
};
