const { ConfigManager } = require('./config-manager');
const logger = require('../utils/logger').logger;

// Initialize configuration manager
let configManager;

// Self-executing function to handle configuration loading
try {
  // Create a new instance of ConfigManager
  configManager = new ConfigManager();
  
  // Load configuration
  configManager.loadConfig();
  
  // Validate configuration
  const validationResult = configManager.validateConfig();
  if (!validationResult.isValid) {
    logger.warn('Configuration validation warnings:', { warnings: validationResult.warnings });
  }
  
  // Get the configuration object
  const config = configManager.getConfig();
  
  // Add helper methods to the config object
  
  /**
   * Get a configuration value by dot notation path
   * @param {string} path - Dot notation path to the configuration value
   * @param {*} [defaultValue] - Default value if the path doesn't exist
   * @returns {*} The configuration value or defaultValue if not found
   */
  config.get = (path, defaultValue) => {
    return configManager.get(path, defaultValue);
  };
  
  /**
   * Check if the configuration is loaded
   * @returns {boolean} True if configuration is loaded
   */
  config.isLoaded = () => configManager.isLoaded();
  
  /**
   * Reload the configuration
   * @returns {Promise<Object>} The reloaded configuration
   */
  config.reload = async () => {
    await configManager.reload();
    return configManager.getConfig();
  };
  
  // Export the configuration object
  module.exports = config;
  
  // Log successful configuration load
  logger.info('Configuration loaded successfully', { 
    env: configManager.get('app.env'),
    version: configManager.get('app.version')
  });
  
} catch (error) {
  // Log the error and exit the process
  logger.error('Failed to load configuration', { 
    error: error.message, 
    stack: error.stack 
  });
  
  // Exit with error code to prevent the application from starting with invalid configuration
  process.exit(1);
}

// Export the config manager for advanced use cases
module.exports.configManager = configManager;
