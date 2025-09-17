const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json } = format;
const config = require('../config/loader');
const { v4: uuidv4 } = require('uuid');

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  let logMessage = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    // Don't log the entire request object if it exists
    if (meta.req) {
      const { req, ...restMeta } = meta;
      const requestInfo = {
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.id || uuidv4()
      };
      logMessage += ` ${JSON.stringify({ ...requestInfo, ...restMeta })}`;
    } else {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
  }
  
  return logMessage;
});

// Create a logger instance
const logger = createLogger({
  level: config.app.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    config.app.isProduction ? json() : combine(colorize(), consoleFormat)
  ),
  defaultMeta: { service: config.app.name, environment: config.app.env },
  transports: [
    // Console transport for all environments
    new transports.Console({
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        config.app.isProduction ? json() : combine(colorize(), consoleFormat)
      )
    })
  ]
});

// Add file transport in production
if (config.app.isProduction) {
  logger.add(
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), json())
    })
  );
  
  logger.add(
    new transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), json())
    })
  );
}

// Add request logging middleware
expressLogger = (req, res, next) => {
  // Skip health check endpoints
  if (req.path === '/health' || req.path === '/ready') {
    next();
    return;
  }

  const start = Date.now();
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Add request ID to request object
  req.id = requestId;
  
  // Log request start
  logger.http('Request started', {
    req,
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.http('Request completed', {
      req,
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length')
    });
  });
  
  next();
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // In production, you might want to restart the process here
  if (config.app.isProduction) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to restart the process here
  if (config.app.isProduction) {
    process.exit(1);
  }
});

module.exports = {
  logger,
  expressLogger,
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
};
