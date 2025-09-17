const Joi = require('joi');
const config = require('.');
const logger = require('../utils/logger').logger;

// Define validation schemas for different configuration sections
const schemas = {
  app: Joi.object({
    env: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
    isProduction: Joi.boolean().default(false),
    isAzure: Joi.boolean().default(false),
    name: Joi.string().default('OptimaCore'),
    version: Joi.string().default('1.0.0'),
    port: Joi.number().port().default(3000),
    host: Joi.string().hostname().default('0.0.0.0'),
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
    instanceId: Joi.string().required(),
    baseUrl: Joi.string().uri().required(),
  }),

  auth: Joi.object({
    sessionSecret: Joi.string().min(32).required(),
    jwtSecret: Joi.string().min(32).required(),
    jwtIssuer: Joi.string().required(),
    jwtAudience: Joi.string().required(),
    jwtAccessTokenExpiry: Joi.string().default('15m'),
    jwtRefreshTokenExpiry: Joi.string().default('7d'),
    jwtPrivateKeyPath: Joi.string(),
    jwtPublicKeyPath: Joi.string(),
    cookieName: Joi.string().default('optima.sid'),
    cookieSecure: Joi.boolean().default(false),
    cookieHttpOnly: Joi.boolean().default(true),
    cookieSameSite: Joi.string().valid('strict', 'lax', 'none').default('lax'),
    sessionMaxAge: Joi.number().default(86400000), // 24 hours
  }),

  redis: Joi.object({
    host: Joi.string().when('connectionString', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    port: Joi.number().port().default(6379),
    password: Joi.string().allow(''),
    db: Joi.number().default(0),
    tls: Joi.boolean().default(false),
    connectionString: Joi.string().uri({
      scheme: ['redis', 'rediss'],
    }),
    keyPrefix: Joi.string().default('optima:'),
  }),

  database: Joi.object({
    client: Joi.string().valid('pg', 'mysql', 'sqlite3', 'oracledb', 'mssql').default('pg'),
    connection: Joi.alternatives().try(
      Joi.string().uri({ scheme: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mssql'] }),
      Joi.object({
        host: Joi.string().required(),
        port: Joi.number().port(),
        user: Joi.string().required(),
        password: Joi.string(),
        database: Joi.string().required(),
        ssl: Joi.alternatives().try(Joi.boolean(), Joi.object({
          rejectUnauthorized: Joi.boolean(),
          ca: Joi.string(),
          key: Joi.string(),
          cert: Joi.string(),
        })),
      })
    ).required(),
    pool: Joi.object({
      min: Joi.number().integer().min(0).default(2),
      max: Joi.number().integer().min(1).default(10),
      idleTimeoutMillis: Joi.number().integer().min(1000).default(30000),
      acquireTimeoutMillis: Joi.number().integer().min(1000).default(30000),
      createTimeoutMillis: Joi.number().integer().min(1000).default(30000),
      propagateCreateError: Joi.boolean().default(true),
    }).default(),
  }),

  azure: Joi.object({
    appService: Joi.object({
      siteName: Joi.string(),
      instanceId: Joi.string(),
      hostname: Joi.string(),
    }).default({}),
    
    appInsights: Joi.object({
      connectionString: Joi.string().uri({ scheme: ['https'] }),
      instrumentationKey: Joi.string(),
      roleName: Joi.string().default('optima-core-api'),
    }).default({}),
    
    keyVault: Joi.object({
      name: Joi.string(),
      uri: Joi.string().uri({ scheme: ['https'] }),
    }).default({}),
    
    cosmos: Joi.object({
      endpoint: Joi.string().uri({ scheme: ['https'] }),
      key: Joi.string(),
      database: Joi.string(),
    }).default({}),
    
    storage: Joi.object({
      connectionString: Joi.string(),
      container: Joi.string(),
    }).default({}),
    
    webPubSub: Joi.object({
      connectionString: Joi.string(),
      hub: Joi.string(),
    }).default({}),
  }).default({}),
};

/**
 * Validate the application configuration
 * @returns {Object} The validated configuration
 * @throws {Error} If validation fails
 */
function validateConfig() {
  const validationOptions = {
    abortEarly: false, // Return all validation errors, not just the first one
    allowUnknown: true, // Allow unknown keys in the config
    stripUnknown: true, // Remove unknown keys from the config
  };

  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    validatedConfig: {},
  };

  // Validate each section of the config
  Object.entries(schemas).forEach(([section, schema]) => {
    if (!config[section]) {
      result.warnings.push(`Configuration section '${section}' is missing`);
      return;
    }

    const { error, value } = schema.validate(config[section], validationOptions);

    if (error) {
      result.isValid = false;
      error.details.forEach(detail => {
        result.errors.push(`[${section}] ${detail.message}`);
      });
    } else {
      result.validatedConfig[section] = value;
    }
  });

  // Validate required Azure settings in production
  if (config.app.isProduction && config.app.isAzure) {
    if (!config.azure.appService.siteName) {
      result.warnings.push('Azure App Service site name is not set');
    }

    if (!config.azure.appInsights.connectionString && !config.azure.appInsights.instrumentationKey) {
      result.warnings.push('Azure Application Insights connection string or instrumentation key is not set');
    }
  }

  // Validate database connection
  if (config.database) {
    if (typeof config.database.connection === 'string') {
      try {
        // Validate connection string format
        new URL(config.database.connection);
      } catch (error) {
        result.errors.push(`Invalid database connection string: ${error.message}`);
      }
    }
  }

  // Log validation results
  if (result.warnings.length > 0) {
    logger.warn('Configuration validation warnings:', { warnings: result.warnings });
  }

  if (!result.isValid) {
    const errorMessage = `Configuration validation failed with ${result.errors.length} error(s)`;
    logger.error(errorMessage, { errors: result.errors });
    throw new Error(`${errorMessage}\n${result.errors.join('\n')}`);
  }

  logger.info('Configuration validation successful');
  return result.validatedConfig;
}

// Export the validated configuration
const validatedConfig = validateConfig();
module.exports = {
  ...validatedConfig,
  validate: validateConfig,
  schemas,
};
