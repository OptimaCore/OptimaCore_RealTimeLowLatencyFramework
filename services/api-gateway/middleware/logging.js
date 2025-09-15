const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level.toUpperCase()}] ${message} ${
    Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
  }`;
});

// Create logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), logFormat)
  ),
  transports: [
    new transports.Console(),
    // Add file transport in production
    ...(process.env.NODE_ENV === 'production'
      ? [
          new transports.File({ filename: 'logs/error.log', level: 'error' }),
          new transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exitOnError: false,
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip, headers } = req;
  
  // Skip health check logs in production
  if (originalUrl === '/health' && process.env.NODE_ENV === 'production') {
    return next();
  }
  
  // Log request details
  logger.info('Request received', {
    method,
    url: originalUrl,
    ip,
    userAgent: headers['user-agent'],
    timestamp: new Date().toISOString(),
  });
  
  // Store start time for response time calculation
  res.locals.startTime = start;
  
  next();
};

// Response logging middleware
const responseLogger = (req, res, next) => {
  const { originalUrl, method } = req;
  
  // Skip health check logs in production
  if (originalUrl === '/health' && process.env.NODE_ENV === 'production') {
    return next();
  }
  
  // Store the original send function
  const originalSend = res.send;
  
  // Override the send function to log the response
  res.send = function (body) {
    const responseTime = Date.now() - res.locals.startTime;
    
    // Log response details
    logger.info('Response sent', {
      method,
      url: originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      storageSource: 'api-gateway',
    });
    
    // Call the original send function
    return originalSend.call(this, body);
  };
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error('Error occurred', {
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
    timestamp: new Date().toISOString(),
  });
  
  next(err);
};

module.exports = {
  logger,
  requestLogger,
  responseLogger,
  errorLogger,
};
