const { getConfig } = require('./config');

class ServiceRegistry {
  constructor() {
    this.config = null;
  }

  /**
   * Initialize the service registry with configuration
   * @param {Object} config - The configuration object
   */
  init(config) {
    this.config = config || getConfig();
  }

  /**
   * Check if a service is enabled
   * @param {string} serviceName - The name of the service to check
   * @returns {boolean} True if the service is enabled, false otherwise
   */
  isEnabled(serviceName) {
    if (!this.config) {
      throw new Error('ServiceRegistry not initialized. Call init() first.');
    }

    const service = this.config.services[serviceName];
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }

    return !!service.enabled;
  }

  /**
   * Get the variant of a service
   * @param {string} serviceName - The name of the service
   * @returns {string} The variant of the service
   */
  getVariant(serviceName) {
    if (!this.config) {
      throw new Error('ServiceRegistry not initialized. Call init() first.');
    }

    const service = this.config.services[serviceName];
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }

    return service.variant || 'default';
  }

  /**
   * Get the configuration for a service
   * @param {string} serviceName - The name of the service
   * @returns {Object} The service configuration
   */
  getServiceConfig(serviceName) {
    if (!this.config) {
      throw new Error('ServiceRegistry not initialized. Call init() first.');
    }

    const service = this.config.services[serviceName];
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }

    // Return a copy to prevent modification of the original config
    return { ...service };
  }
}

// Create a singleton instance
const serviceRegistry = new ServiceRegistry();

// Auto-initialize with config if available
try {
  serviceRegistry.init();
} catch (error) {
  // Config not loaded yet, will need to be initialized manually
  console.warn('ServiceRegistry: Configuration not loaded. Call init() before using the registry.');
}

module.exports = {
  serviceRegistry,
  isEnabled: (serviceName) => serviceRegistry.isEnabled(serviceName),
  getVariant: (serviceName) => serviceRegistry.getVariant(serviceName),
  getServiceConfig: (serviceName) => serviceRegistry.getServiceConfig(serviceName),
  init: (config) => serviceRegistry.init(config)
};

// Export the class for testing purposes
module.exports.ServiceRegistry = ServiceRegistry;
