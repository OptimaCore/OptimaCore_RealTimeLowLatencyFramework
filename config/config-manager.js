const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { expand } = require('dotenv-expand');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger').logger;

class ConfigManager {
  constructor() {
    this.config = {};
    this.validated = false;
    this.envVars = {};
  }

  /**
   * Initialize the configuration manager
   * @param {Object} [options] - Configuration options
   * @param {string} [options.envPath] - Path to the .env file
   * @param {string} [options.configPath] - Path to the config directory
   * @param {boolean} [options.validate=true] - Whether to validate the configuration
   * @returns {Promise<Object>} The loaded and validated configuration
   */
  async init(options = {}) {
    const {
      envPath = path.resolve(process.cwd(), '.env'),
      configPath = path.resolve(process.cwd(), 'config'),
      validate = true,
    } = options;

    try {
      // Load environment variables
      this.loadEnvFile(envPath);
      
      // Load YAML configuration
      await this.loadYamlConfig(configPath);
      
      // Merge with environment variables
      this.mergeWithEnvVars();
      
      // Set default values
      this.setDefaults();
      
      // Validate the configuration if requested
      if (validate) {
        await this.validate();
      }
      
      this.validated = true;
      logger.info('Configuration initialized successfully');
      
      return this.config;
    } catch (error) {
      logger.error('Failed to initialize configuration', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Load environment variables from a .env file
   * @param {string} envPath - Path to the .env file
   * @private
   */
  loadEnvFile(envPath) {
    try {
      if (fs.existsSync(envPath)) {
        const result = dotenv.config({ path: envPath });
        
        if (result.error) {
          throw result.error;
        }
        
        // Expand variables in the .env file
        expand(result);
        
        // Store the loaded environment variables
        this.envVars = { ...process.env };
        
        logger.info(`Loaded environment variables from ${envPath}`);
      } else {
        logger.warn(`No .env file found at ${envPath}`);
      }
    } catch (error) {
      logger.error(`Failed to load environment variables from ${envPath}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Load YAML configuration files from the config directory
   * @param {string} configPath - Path to the config directory
   * @private
   */
  async loadYamlConfig(configPath) {
    try {
      // Load the main config file
      const mainConfigPath = path.join(configPath, 'config.yaml');
      
      if (!fs.existsSync(mainConfigPath)) {
        throw new Error(`Main configuration file not found at ${mainConfigPath}`);
      }
      
      const configContent = fs.readFileSync(mainConfigPath, 'utf8');
      this.config = yaml.load(configContent) || {};
      
      // Load environment-specific config if it exists
      const env = process.env.NODE_ENV || 'development';
      const envConfigPath = path.join(configPath, `config.${env}.yaml`);
      
      if (fs.existsSync(envConfigPath)) {
        const envConfigContent = fs.readFileSync(envConfigPath, 'utf8');
        const envConfig = yaml.load(envConfigContent) || {};
        
        // Merge environment-specific config with the main config
        this.mergeDeep(this.config, envConfig);
        
        logger.info(`Loaded environment-specific configuration for ${env}`);
      }
      
      // Set the environment in the config
      this.config.env = env;
      this.config.isProduction = env === 'production';
      this.config.isAzure = !!process.env.WEBSITE_SITE_NAME;
      
      logger.info('Configuration loaded from YAML files');
    } catch (error) {
      logger.error('Failed to load YAML configuration', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Merge environment variables into the configuration
   * @private
   */
  mergeWithEnvVars() {
    // Map environment variables to configuration
    const envMappings = {
      // App settings
      'NODE_ENV': 'app.env',
      'PORT': 'app.port',
      'HOST': 'app.host',
      'LOG_LEVEL': 'app.logLevel',
      'INSTANCE_ID': 'app.instanceId',
      'BASE_URL': 'app.baseUrl',
      
      // Auth settings
      'SESSION_SECRET': 'auth.sessionSecret',
      'JWT_SECRET': 'auth.jwtSecret',
      'JWT_ISSUER': 'auth.jwtIssuer',
      'JWT_AUDIENCE': 'auth.jwtAudience',
      'JWT_ACCESS_TOKEN_EXPIRY': 'auth.jwtAccessTokenExpiry',
      'JWT_REFRESH_TOKEN_EXPIRY': 'auth.jwtRefreshTokenExpiry',
      'JWT_PRIVATE_KEY_PATH': 'auth.jwtPrivateKeyPath',
      'JWT_PUBLIC_KEY_PATH': 'auth.jwtPublicKeyPath',
      'SESSION_COOKIE_NAME': 'auth.cookieName',
      'SESSION_COOKIE_SECURE': 'auth.cookieSecure',
      'SESSION_COOKIE_HTTPONLY': 'auth.cookieHttpOnly',
      'SESSION_COOKIE_SAMESITE': 'auth.cookieSameSite',
      'SESSION_MAX_AGE': 'auth.sessionMaxAge',
      
      // Redis settings
      'REDIS_HOST': 'redis.host',
      'REDIS_PORT': 'redis.port',
      'REDIS_PASSWORD': 'redis.password',
      'REDIS_DB': 'redis.db',
      'REDIS_TLS': 'redis.tls',
      'REDIS_CONNECTION_STRING': 'redis.connectionString',
      'REDIS_KEY_PREFIX': 'redis.keyPrefix',
      
      // Database settings
      'DB_HOST': 'database.connection.host',
      'DB_PORT': 'database.connection.port',
      'DB_USER': 'database.connection.user',
      'DB_PASSWORD': 'database.connection.password',
      'DB_NAME': 'database.connection.database',
      'DB_SSL': 'database.connection.ssl',
      'DATABASE_URL': 'database.connection',
      
      // Azure settings
      'WEBSITE_SITE_NAME': 'azure.appService.siteName',
      'WEBSITE_INSTANCE_ID': 'azure.appService.instanceId',
      'WEBSITE_HOSTNAME': 'azure.appService.hostname',
      'APPLICATIONINSIGHTS_CONNECTION_STRING': 'azure.appInsights.connectionString',
      'APPINSIGHTS_INSTRUMENTATION_KEY': 'azure.appInsights.instrumentationKey',
      'KEY_VAULT_NAME': 'azure.keyVault.name',
      'KEY_VAULT_URI': 'azure.keyVault.uri',
      'COSMOS_ENDPOINT': 'azure.cosmos.endpoint',
      'COSMOS_KEY': 'azure.cosmos.key',
      'COSMOS_DATABASE': 'azure.cosmos.database',
      'AZURE_STORAGE_CONNECTION_STRING': 'azure.storage.connectionString',
      'AZURE_STORAGE_CONTAINER': 'azure.storage.container',
      'WEBPUBSUB_CONNECTION_STRING': 'azure.webPubSub.connectionString',
      'WEBPUBSUB_HUB': 'azure.webPubSub.hub',
    };
    
    // Apply environment variables to the config
    Object.entries(envMappings).forEach(([envVar, configPath]) => {
      if (process.env[envVar] !== undefined) {
        this.setConfigValue(configPath, process.env[envVar]);
      }
    });
  }

  /**
   * Set default values for required configuration
   * @private
   */
  setDefaults() {
    // Ensure required paths exist
    if (!this.config.app) this.config.app = {};
    if (!this.config.auth) this.config.auth = {};
    if (!this.config.redis) this.config.redis = {};
    if (!this.config.database) this.config.database = {};
    if (!this.config.azure) this.config.azure = {};
    
    // Set default values
    const defaults = {
      app: {
        name: 'OptimaCore',
        version: '1.0.0',
        port: 3000,
        host: '0.0.0.0',
        logLevel: this.config.app.isProduction ? 'info' : 'debug',
        instanceId: process.env.WEBSITE_INSTANCE_ID || uuidv4(),
        baseUrl: `http://localhost:${this.config.app.port || 3000}`,
      },
      auth: {
        jwtIssuer: 'OptimaCore',
        jwtAudience: 'optima-client',
        jwtAccessTokenExpiry: '15m',
        jwtRefreshTokenExpiry: '7d',
        cookieName: 'optima.sid',
        cookieSecure: this.config.app.isProduction,
        cookieHttpOnly: true,
        cookieSameSite: 'lax',
        sessionMaxAge: 86400000, // 24 hours
      },
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        tls: false,
        keyPrefix: 'optima:',
      },
      database: {
        client: 'pg',
        connection: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'postgres',
          database: 'optimacore',
          ssl: false,
        },
        pool: {
          min: 2,
          max: 10,
          idleTimeoutMillis: 30000,
          acquireTimeoutMillis: 30000,
        },
      },
      azure: {
        appService: {},
        appInsights: {
          roleName: 'optima-core-api',
        },
        keyVault: {},
        cosmos: {},
        storage: {
          container: 'optimacore',
        },
        webPubSub: {
          hub: 'default',
        },
      },
    };
    
    // Apply defaults
    this.mergeDeep(this.config, defaults);
  }

  /**
   * Validate the configuration
   * @returns {boolean} True if the configuration is valid
   * @throws {Error} If the configuration is invalid
   */
  async validate() {
    try {
      // Basic validation
      if (!this.config.app) {
        throw new Error('Missing required configuration section: app');
      }
      
      if (!this.config.app.name) {
        throw new Error('Missing required configuration: app.name');
      }
      
      // Validate port
      const port = parseInt(this.config.app.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port number: ${this.config.app.port}`);
      }
      
      // Validate auth configuration
      if (!this.config.auth) {
        throw new Error('Missing required configuration section: auth');
      }
      
      if (this.config.app.isProduction) {
        if (!this.config.auth.sessionSecret || this.config.auth.sessionSecret === 'your-session-secret') {
          throw new Error('Session secret is not set or is using the default value');
        }
        
        if (!this.config.auth.jwtSecret || this.config.auth.jwtSecret === 'your-jwt-secret') {
          throw new Error('JWT secret is not set or is using the default value');
        }
      }
      
      // Validate database configuration
      if (this.config.database) {
        if (typeof this.config.database.connection === 'string') {
          // Validate connection string
          try {
            new URL(this.config.database.connection);
          } catch (error) {
            throw new Error(`Invalid database connection string: ${error.message}`);
          }
        } else if (this.config.database.connection) {
          // Validate connection object
          const conn = this.config.database.connection;
          if (!conn.host || !conn.user || !conn.database) {
            throw new Error('Database configuration is missing required fields (host, user, database)');
          }
        } else {
          throw new Error('Database connection configuration is missing');
        }
      }
      
      logger.info('Configuration validation passed');
      return true;
    } catch (error) {
      logger.error('Configuration validation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get the configuration
   * @returns {Object} The configuration object
   */
  getConfig() {
    if (!this.validated) {
      logger.warn('Configuration has not been validated. Call init() first.');
    }
    return this.config;
  }

  /**
   * Get a configuration value using dot notation
   * @param {string} path - Dot notation path to the configuration value
   * @param {*} [defaultValue] - Default value if the path doesn't exist
   * @returns {*} The configuration value or default value
   */
  get(path, defaultValue) {
    const parts = path.split('.');
    let current = this.config;

    for (const part of parts) {
      if (current[part] === undefined) {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Set a configuration value using dot notation
   * @param {string} path - Dot notation path to the configuration value
   * @param {*} value - The value to set
   * @private
   */
  setConfigValue(path, value) {
    const parts = path.split('.');
    let current = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        current[part] = {};
      }
      current = current[part];
    }

    // Convert string values to appropriate types
    const lastPart = parts[parts.length - 1];
    const currentValue = current[lastPart];
    
    if (currentValue !== undefined) {
      // Preserve the type of the existing value
      if (typeof currentValue === 'number') {
        current[lastPart] = Number(value);
      } else if (typeof currentValue === 'boolean') {
        current[lastPart] = value === 'true' || value === '1' || value === 'yes';
      } else if (Array.isArray(currentValue) && typeof value === 'string') {
        current[lastPart] = value.split(',').map(item => item.trim());
      } else {
        current[lastPart] = value;
      }
    } else {
      // For new values, try to infer the type
      if (value === 'true' || value === 'false') {
        current[lastPart] = value === 'true';
      } else if (!isNaN(Number(value)) && value.trim() !== '') {
        current[lastPart] = Number(value);
      } else if (value.includes(',')) {
        current[lastPart] = value.split(',').map(item => item.trim());
      } else {
        current[lastPart] = value;
      }
    }
  }

  /**
   * Deep merge two objects
   * @param {Object} target - The target object
   * @param {Object} source - The source object
   * @returns {Object} The merged object
   * @private
   */
  mergeDeep(target, source) {
    if (source && typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          this.mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      });
    }
    return target;
  }
}

// Create a singleton instance
const configManager = new ConfigManager();

// Initialize with default options if not in test environment
if (process.env.NODE_ENV !== 'test') {
  configManager.init().catch(error => {
    logger.error('Failed to initialize configuration', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = configManager;
