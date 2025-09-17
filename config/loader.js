const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { expand } = require('dotenv-expand');
const { createLogger, format, transports } = require('winston');

// Load environment variables from .env file if it exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  expand(dotenv.config({ path: envPath }));
}

// Create logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [new transports.Console()]
});

// Helper function to get environment variables with defaults
function getEnvVar(key, defaultValue = undefined, required = false) {
  const value = process.env[key];
  
  if (value === undefined || value === '') {
    if (required && defaultValue === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  
  return value;
}

// Load configuration
function loadConfig() {
  const env = getEnvVar('NODE_ENV', 'development');
  const isProduction = env === 'production';
  const isAzure = !!getEnvVar('WEBSITE_SITE_NAME');

  // Base configuration
  const config = {
    // Application settings
    app: {
      env,
      isProduction,
      isAzure,
      name: getEnvVar('APP_NAME', 'OptimaCore'),
      port: parseInt(getEnvVar('PORT', '3000'), 10),
      host: getEnvVar('HOST', '0.0.0.0'),
      logLevel: getEnvVar('LOG_LEVEL', isProduction ? 'info' : 'debug'),
      instanceId: getEnvVar('INSTANCE_ID', 'local')
    },

    // Session & Authentication
    auth: {
      sessionSecret: getEnvVar('SESSION_SECRET', 'your-session-secret', isProduction),
      jwtSecret: getEnvVar('JWT_SECRET', 'your-jwt-secret', isProduction),
      jwtIssuer: getEnvVar('JWT_ISSUER', 'OptimaCore'),
      jwtAudience: getEnvVar('JWT_AUDIENCE', 'optima-client'),
      jwtAccessTokenExpiry: getEnvVar('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
      jwtRefreshTokenExpiry: getEnvVar('JWT_REFRESH_TOKEN_EXPIRY', '7d'),
      jwtPrivateKeyPath: getEnvVar('JWT_PRIVATE_KEY_PATH', './secrets/private.key'),
      jwtPublicKeyPath: getEnvVar('JWT_PUBLIC_KEY_PATH', './secrets/public.key')
    },

    // Redis configuration
    redis: {
      host: getEnvVar('REDIS_HOST', 'localhost'),
      port: parseInt(getEnvVar('REDIS_PORT', '6379'), 10),
      password: getEnvVar('REDIS_PASSWORD', ''),
      db: parseInt(getEnvVar('REDIS_DB', '0'), 10),
      tls: getEnvVar('REDIS_TLS', 'false') === 'true',
      // For Azure Redis, use connection string directly
      connectionString: getEnvVar('REDIS_CONNECTION_STRING')
    },

    // Database configuration
    database: {
      host: getEnvVar('DB_HOST', 'localhost'),
      port: parseInt(getEnvVar('DB_PORT', '5432'), 10),
      user: getEnvVar('DB_USER', 'postgres'),
      password: getEnvVar('DB_PASSWORD', 'postgres'),
      name: getEnvVar('DB_NAME', 'optimacore'),
      ssl: getEnvVar('DB_SSL', 'false') === 'true',
      // For Azure Database for PostgreSQL, use connection string directly
      connectionString: getEnvVar('POSTGRES_CONNECTION_STRING')
    },

    // Azure Services
    azure: {
      // App Service settings (auto-injected in Azure)
      website: {
        siteName: getEnvVar('WEBSITE_SITE_NAME'),
        instanceId: getEnvVar('WEBSITE_INSTANCE_ID'),
        hostname: getEnvVar('WEBSITE_HOSTNAME')
      },
      
      // Application Insights
      appInsights: {
        connectionString: getEnvVar('APPLICATIONINSIGHTS_CONNECTION_STRING'),
        instrumentationKey: getEnvVar('APPINSIGHTS_INSTRUMENTATION_KEY')
      },
      
      // Key Vault
      keyVault: {
        name: getEnvVar('KEY_VAULT_NAME'),
        uri: getEnvVar('KEY_VAULT_URI')
      },
      
      // Cosmos DB
      cosmos: {
        endpoint: getEnvVar('COSMOS_ENDPOINT'),
        key: getEnvVar('COSMOS_KEY'),
        database: getEnvVar('COSMOS_DATABASE', 'optimacore')
      },
      
      // Storage
      storage: {
        connectionString: getEnvVar('AZURE_STORAGE_CONNECTION_STRING'),
        container: getEnvVar('AZURE_STORAGE_CONTAINER', 'optimacore')
      },
      
      // Web PubSub
      webPubSub: {
        connectionString: getEnvVar('WEBPUBSUB_CONNECTION_STRING'),
        hub: getEnvVar('WEBPUBSUB_HUB', 'default')
      }
    },

    // CORS configuration
    cors: {
      allowedOrigins: getEnvVar('ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:8080').split(','),
      allowedMethods: getEnvVar('ALLOWED_METHODS', 'GET,POST,PUT,DELETE,OPTIONS').split(','),
      allowedHeaders: getEnvVar('ALLOWED_HEADERS', 'Content-Type,Authorization,X-Requested-With,Origin,Accept').split(',')
    },

    // Security headers
    security: {
      csp: getEnvVar('CSP_DIRECTIVES'),
      enableHsts: getEnvVar('ENABLE_HSTS', 'true') === 'true',
      xPoweredBy: getEnvVar('X_POWERED_BY', 'OptimaCore'),
      xContentTypeOptions: getEnvVar('X_CONTENT_TYPE_OPTIONS', 'nosniff'),
      xFrameOptions: getEnvVar('X_FRAME_OPTIONS', 'DENY'),
      xXssProtection: getEnvVar('X_XSS_PROTECTION', '1; mode=block'),
      referrerPolicy: getEnvVar('REFERRER_POLICY', 'strict-origin-when-cross-origin'),
      permissionsPolicy: getEnvVar('PERMISSIONS_POLICY', 'geolocation=(), microphone=(), camera=()')
    },

    // Feature flags
    features: {
      enableMetrics: getEnvVar('ENABLE_METRICS', 'true') === 'true',
      enableRequestLogging: getEnvVar('ENABLE_REQUEST_LOGGING', 'true') === 'true',
      enableCache: getEnvVar('ENABLE_CACHE', 'true') === 'true',
      enableAzureKeyVault: getEnvVar('ENABLE_AZURE_KEY_VAULT', 'false') === 'true',
      enableAnalytics: getEnvVar('ENABLE_ANALYTICS', 'false') === 'true'
    },

    // Rate limiting
    rateLimit: {
      windowMs: parseInt(getEnvVar('RATE_LIMIT_WINDOW_MS', '900000'), 10), // 15 minutes
      maxRequests: parseInt(getEnvVar('RATE_LIMIT_MAX_REQUESTS', '100'), 10)
    },

    // Session configuration
    session: {
      cookieName: getEnvVar('SESSION_COOKIE_NAME', 'optimacore.sid'),
      cookieSecure: getEnvVar('SESSION_COOKIE_SECURE', isProduction ? 'true' : 'false') === 'true',
      cookieHttpOnly: getEnvVar('SESSION_COOKIE_HTTPONLY', 'true') === 'true',
      cookieSameSite: getEnvVar('SESSION_COOKIE_SAMESITE', 'lax'),
      maxAge: parseInt(getEnvVar('SESSION_MAX_AGE', '86400000'), 10) // 24 hours
    },

    // Monitoring & Observability
    monitoring: {
      appInsights: {
        connectionString: getEnvVar('APP_INSIGHTS_CONNECTION_STRING')
      },
      sentry: {
        dsn: getEnvVar('SENTRY_DSN')
      }
    },

    // Azure Cost Management
    costManagement: {
      budgetAlertEmails: getEnvVar('BUDGET_ALERT_EMAILS', 'admin@example.com').split(','),
      defaultBudgetAmount: parseInt(getEnvVar('DEFAULT_BUDGET_AMOUNT', '1000'), 10),
      defaultBudgetTimeGrain: getEnvVar('DEFAULT_BUDGET_TIME_GRAIN', 'Monthly')
    }
  };

  // Log configuration in development
  if (!isProduction) {
    logger.debug('Loaded configuration:', JSON.stringify(config, null, 2));
  }

  return config;
}

// Export the configuration
const config = loadConfig();
module.exports = config;
