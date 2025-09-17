const config = require('../config');
const logger = require('./logger').logger;

class EnvUtils {
  /**
   * Get an environment variable with optional default value and validation
   * @param {string} key - The environment variable name
   * @param {*} [defaultValue] - Default value if the variable is not set
   * @param {Object} [options] - Additional options
   * @param {Function} [options.validator] - Validation function that returns true if the value is valid
   * @param {string} [options.type='string'] - Expected type of the value
   * @param {boolean} [options.required=false] - Whether the variable is required
   * @param {string} [options.secret=false] - Whether the value is a secret (will be masked in logs)
   * @returns {*} The environment variable value or default value
   */
  static getEnvVar(key, defaultValue, options = {}) {
    const {
      validator = null,
      type = 'string',
      required = false,
      secret = false,
    } = options;

    const value = process.env[key];
    const isSet = value !== undefined && value !== '';

    // Throw error if required but not set
    if (required && !isSet && defaultValue === undefined) {
      const error = new Error(`Required environment variable ${key} is not set`);
      logger.error(error.message);
      throw error;
    }

    // Use default value if not set
    const finalValue = isSet ? value : defaultValue;

    // Skip further checks if value is not set and not required
    if (!isSet && !required) {
      return finalValue;
    }

    // Type checking
    let typedValue;
    try {
      switch (type.toLowerCase()) {
        case 'number':
          typedValue = Number(finalValue);
          if (isNaN(typedValue)) throw new Error(`Value '${finalValue}' is not a valid number`);
          break;
        case 'boolean':
          if (typeof finalValue === 'string') {
            typedValue = finalValue.toLowerCase() === 'true';
          } else {
            typedValue = Boolean(finalValue);
          }
          break;
        case 'array':
          if (typeof finalValue === 'string') {
            typedValue = finalValue.split(',').map(item => item.trim());
          } else if (Array.isArray(finalValue)) {
            typedValue = finalValue;
          } else {
            typedValue = [];
          }
          break;
        case 'object':
          try {
            typedValue = typeof finalValue === 'string' ? JSON.parse(finalValue) : finalValue || {};
          } catch (e) {
            throw new Error(`Invalid JSON in environment variable ${key}`);
          }
          break;
        case 'string':
        default:
          typedValue = String(finalValue);
      }
    } catch (error) {
      const message = `Invalid type for environment variable ${key}: ${error.message}`;
      logger.error(message);
      throw new Error(message);
    }

    // Custom validation
    if (validator && !validator(typedValue)) {
      const message = `Validation failed for environment variable ${key}`;
      logger.error(message);
      throw new Error(message);
    }

    // Log the value (mask secrets)
    const logValue = secret ? '***' : typedValue;
    logger.debug(`Environment variable ${key} = ${JSON.stringify(logValue)}`);

    return typedValue;
  }

  /**
   * Get a required environment variable
   * @param {string} key - The environment variable name
   * @param {Object} [options] - Additional options
   * @returns {*} The environment variable value
   */
  static getRequiredEnvVar(key, options = {}) {
    return this.getEnvVar(key, undefined, { ...options, required: true });
  }

  /**
   * Get a secret environment variable (will be masked in logs)
   * @param {string} key - The environment variable name
   * @param {*} [defaultValue] - Default value if the variable is not set
   * @param {Object} [options] - Additional options
   * @returns {*} The environment variable value or default value
   */
  static getSecret(key, defaultValue, options = {}) {
    return this.getEnvVar(key, defaultValue, { ...options, secret: true });
  }

  /**
   * Get a required secret environment variable
   * @param {string} key - The environment variable name
   * @param {Object} [options] - Additional options
   * @returns {*} The environment variable value
   */
  static getRequiredSecret(key, options = {}) {
    return this.getEnvVar(key, undefined, { ...options, required: true, secret: true });
  }

  /**
   * Validate that all required environment variables are set
   * @param {string[]} requiredVars - Array of required environment variable names
   * @throws {Error} If any required variables are missing
   */
  static validateRequiredVars(requiredVars) {
    const missingVars = [];

    requiredVars.forEach(varName => {
      if (process.env[varName] === undefined || process.env[varName] === '') {
        missingVars.push(varName);
      }
    });

    if (missingVars.length > 0) {
      const error = new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      logger.error(error.message);
      throw error;
    }
  }

  /**
   * Get the current environment (NODE_ENV)
   * @returns {string} The current environment
   */
  static getEnvironment() {
    return config.app.env;
  }

  /**
   * Check if the current environment matches the given environment
   * @param {string|string[]} env - Environment name or array of names to check against
   * @returns {boolean} True if the current environment matches
   */
  static isEnvironment(env) {
    const currentEnv = this.getEnvironment();
    if (Array.isArray(env)) {
      return env.includes(currentEnv);
    }
    return currentEnv === env;
  }

  /**
   * Check if the application is running in production
   * @returns {boolean} True if running in production
   */
  static isProduction() {
    return this.isEnvironment('production');
  }

  /**
   * Check if the application is running in development
   * @returns {boolean} True if running in development
   */
  static isDevelopment() {
    return this.isEnvironment('development');
  }

  /**
   * Check if the application is running in test
   * @returns {boolean} True if running in test
   */
  static isTest() {
    return this.isEnvironment('test');
  }

  /**
   * Get the application configuration
   * @returns {Object} The application configuration
   */
  static getConfig() {
    return config;
  }

  /**
   * Get a configuration value using dot notation
   * @param {string} path - Dot notation path to the configuration value
   * @param {*} [defaultValue] - Default value if the path doesn't exist
   * @returns {*} The configuration value or default value
   */
  static getConfigValue(path, defaultValue) {
    const parts = path.split('.');
    let current = config;

    for (const part of parts) {
      if (current[part] === undefined) {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Load environment variables from a .env file
   * @param {string} [path] - Path to the .env file (default: .env in the project root)
   */
  static loadEnvFile(path) {
    const { error, parsed } = require('dotenv').config({
      path: path || '.env',
    });

    if (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`No .env file found at ${path || '.env'}`);
      } else {
        logger.error(`Failed to load .env file: ${error.message}`);
        throw error;
      }
    } else if (parsed) {
      logger.info(`Loaded environment variables from ${path || '.env'}`);
    }
  }
}

module.exports = EnvUtils;
