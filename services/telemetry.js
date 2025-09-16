const winston = require('winston');
const { AzureApplicationInsightsLogger } = require('winston-azure-application-insights');
const { v4: uuidv4 } = require('uuid');

// Create a request context to track request-specific data
const requestContext = new Map();

// Create a logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'optima-core-auth' },
  transports: [
    // Write all logs with importance level of 'error' or less to 'error.log'
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with importance level of 'info' or less to 'combined.log'
    new winston.transports.File({ filename: 'logs/combined.log' })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Add Azure Application Insights in production
if (process.env.APPLICATION_INSIGHTS_CONNECTION_STRING) {
  logger.add(new AzureApplicationInsightsLogger({
    key: process.env.APPLICATION_INSIGHTS_CONNECTION_STRING,
    treatErrorsAsExceptions: true
  }));
}

// If we're not in production, log to the console with colorization
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create a child logger with request context
const createRequestLogger = (req) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Store request context
  requestContext.set(requestId, {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    startTime: Date.now()
  });
  
  // Add request ID to response headers
  req.res.setHeader('X-Request-ID', requestId);
  
  return logger.child({ requestId });
};

// Log the end of a request
const logRequestCompletion = (req, res, data = {}) => {
  const requestId = req.headers['x-request-id'];
  if (!requestId) return;
  
  const context = requestContext.get(requestId);
  if (!context) return;
  
  const duration = Date.now() - context.startTime;
  
  logger.info('Request completed', {
    ...context,
    statusCode: res.statusCode,
    duration,
    ...data
  });
  
  // Clean up
  requestContext.delete(requestId);
};

// Log an error with request context
const logError = (error, req = null, additionalData = {}) => {
  const logData = {
    error: error.message,
    stack: error.stack,
    ...additionalData
  };
  
  if (req) {
    logData.request = {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userId: req.user?.id
    };
  }
  
  logger.error('Error occurred', logData);
  
  return logData;
};

// Track metrics
const metrics = {
  authAttempts: new winston.metrics.Counter('auth_attempts_total', 'Total authentication attempts'),
  authFailures: new winston.metrics.Counter('auth_failures_total', 'Total authentication failures'),
  tokenRefreshes: new winston.metrics.Counter('token_refreshes_total', 'Total token refreshes'),
  tokenRefreshFailures: new winston.metrics.Counter('token_refresh_failures_total', 'Total token refresh failures')
};

module.exports = {
  logger,
  createRequestLogger,
  logRequestCompletion,
  logError,
  metrics,
  // Export winston in case it's needed elsewhere
  winston
};
