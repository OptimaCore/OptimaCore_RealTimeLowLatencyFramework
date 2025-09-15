const fs = require('fs').promises;
const path = require('path');
const yaml = require('yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Schema for configuration validation
const configSchema = {
  type: 'object',
  required: ['environment', 'services', 'features', 'app'],
  properties: {
    environment: { type: 'string', enum: ['development', 'staging', 'production'] },
    services: {
      type: 'object',
      required: ['redis', 'postgres', 'cosmos', 'blob', 'webpubsub'],
      properties: {
        redis: {
          type: 'object',
          required: ['enabled', 'variant', 'connectionString'],
          properties: {
            enabled: { type: 'boolean' },
            variant: { type: 'string' },
            connectionString: { type: 'string' }
          }
        },
        postgres: {
          type: 'object',
          required: ['enabled', 'variant', 'connectionString'],
          properties: {
            enabled: { type: 'boolean' },
            variant: { type: 'string' },
            connectionString: { type: 'string' }
          }
        },
        cosmos: {
          type: 'object',
          required: ['enabled', 'variant', 'endpoint', 'key', 'database'],
          properties: {
            enabled: { type: 'boolean' },
            variant: { type: 'string' },
            endpoint: { type: 'string', format: 'uri' },
            key: { type: 'string' },
            database: { type: 'string' }
          }
        },
        blob: {
          type: 'object',
          required: ['enabled', 'variant', 'connectionString', 'container'],
          properties: {
            enabled: { type: 'boolean' },
            variant: { type: 'string' },
            connectionString: { type: 'string' },
            container: { type: 'string' }
          }
        },
        webpubsub: {
          type: 'object',
          required: ['enabled', 'variant', 'connectionString', 'hub'],
          properties: {
            enabled: { type: 'boolean' },
            variant: { type: 'string' },
            connectionString: { type: 'string' },
            hub: { type: 'string' }
          }
        }
      }
    },
    features: {
      type: 'object',
      required: ['enableAnalytics', 'enableCaching', 'enableLogging'],
      properties: {
        enableAnalytics: { type: 'boolean' },
        enableCaching: { type: 'boolean' },
        enableLogging: { type: 'boolean' }
      }
    },
    app: {
      type: 'object',
      required: ['port', 'logLevel', 'environment', 'instanceId'],
      properties: {
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        logLevel: { type: 'string', enum: ['error', 'warn', 'info', 'debug', 'trace'] },
        environment: { type: 'string' },
        instanceId: { type: 'string' }
      }
    }
  }
};

class ConfigManager {
  constructor() {
    this.config = null;
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.validate = this.ajv.compile(configSchema);
  }

  /**
   * Load and validate configuration
   * @param {string} configPath - Path to the config file
   * @returns {Promise<Object>} The loaded and validated configuration
   */
  async loadConfig(configPath = null) {
    try {
      const configFile = configPath || path.join(process.cwd(), 'config', 'config.yaml');
      console.log(`Loading config from: ${configFile}`);
      
      const fileContent = await fs.readFile(configFile, 'utf8');
      console.log('Raw config content:', fileContent.substring(0, 200) + '...');
      
      // Parse YAML and expand environment variables
      const parsedConfig = yaml.parse(fileContent);
      console.log('Parsed config:', JSON.stringify(parsedConfig, null, 2).substring(0, 200) + '...');
      
      this.config = this._expandEnvVars(parsedConfig);
      console.log('After env expansion:', JSON.stringify(this.config, null, 2).substring(0, 200) + '...');
      
      // Validate against schema
      const valid = this.validate(this.config);
      if (!valid) {
        const errorDetails = this.validate.errors.map(err => ({
          path: err.instancePath,
          message: err.message,
          params: err.params,
          schemaPath: err.schemaPath
        }));
        console.error('Validation errors:', JSON.stringify(errorDetails, null, 2));
        throw new Error(`Invalid configuration: ${this.ajv.errorsText(this.validate.errors, { separator: '\n' })}`);
      }
      
      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Get the current configuration
   * @returns {Object} The current configuration
   */
  getConfig() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Expand environment variables in the configuration
   * @private
   */
  _expandEnvVars(obj) {
    if (typeof obj === 'string') {
      // Replace ${VAR} with process.env.VAR or default value after :
      return obj.replace(/\$\{([^:}]+)(?::([^}]+))?}/g, (_, varName, defaultValue) => {
        return process.env[varName] || (defaultValue || '');
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this._expandEnvVars(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result = {};
      for (const key in obj) {
        result[key] = this._expandEnvVars(obj[key]);
      }
      return result;
    }
    
    return obj;
  }
}

// Create a singleton instance
const configManager = new ConfigManager();

// Export a promise that resolves to the config
module.exports = {
  loadConfig: configManager.loadConfig.bind(configManager),
  getConfig: configManager.getConfig.bind(configManager)
};

// Auto-load config if this is the main module
if (require.main === module) {
  (async () => {
    try {
      await configManager.loadConfig();
      console.log('Configuration loaded successfully:');
      console.log(JSON.stringify(configManager.getConfig(), null, 2));
    } catch (error) {
      console.error('Failed to load configuration:', error);
      process.exit(1);
    }
  })();
}
