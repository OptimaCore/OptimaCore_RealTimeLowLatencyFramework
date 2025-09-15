const fs = require('fs').promises;
const path = require('path');
const { loadConfig } = require('../services/config');
const { ServiceRegistry, serviceRegistry } = require('../services/registry');

// Helper function to read file with better error handling
async function safeReadFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    throw error;
  }
}

describe('Configuration System', () => {
  const fixturesPath = path.resolve(__dirname, 'fixtures');
  const testConfigPath = path.join(fixturesPath, 'test-config.yaml');
  
  describe('Config Manager', () => {
    it('should load and validate a configuration file', async () => {
      console.log('Current working directory:', process.cwd());
      console.log('Test config path:', testConfigPath);
      
      // Verify the test file exists and is readable
      const content = await safeReadFile(testConfigPath);
      console.log('Test config content:', content);
      
      // List files in the test directory for debugging
      try {
        const files = await fs.readdir(fixturesPath);
        console.log('Files in test fixtures directory:', files);
      } catch (err) {
        console.warn('Could not list test fixtures directory:', err.message);
      }
      
      // Load and validate the config
      const config = await loadConfig(testConfigPath);
      console.log('Loaded config:', JSON.stringify(config, null, 2));
      
      // Basic validation
      expect(config).toBeDefined();
      expect(config.environment).toBe('test');
      expect(config.services.redis.enabled).toBe(true);
    });
 
    it('should throw an error for invalid configuration', async () => {
      const invalidConfigPath = path.join(fixturesPath, 'invalid-config.yaml');
      await fs.writeFile(invalidConfigPath, 'invalid: yaml: here');
      
      await expect(loadConfig(invalidConfigPath)).rejects.toThrow();
      
      // Clean up
      await fs.unlink(invalidConfigPath).catch(() => {});
    });

    it('should expand environment variables in configuration', async () => {
      process.env.TEST_VAR = 'test-value';
      const configContent = `
        app:
          testEnv: ${'${TEST_VAR:-default}'}
      `;
      
      const tempConfigPath = path.join(fixturesPath, 'temp-config.yaml');
      await fs.writeFile(tempConfigPath, configContent);
      
      const config = await loadConfig(tempConfigPath);
      expect(config.app.testEnv).toBe('test-value');
      
      // Clean up
      await fs.unlink(tempConfigPath).catch(() => {});
    });
  });

  describe('Service Registry', () => {
    let registry;
    
    beforeEach(async () => {
      registry = new ServiceRegistry();
      const config = await loadConfig(testConfigPath);
      registry.init(config);
    });

    it('should check if a service is enabled', () => {
      expect(registry.isEnabled('redis')).toBe(true);
      expect(registry.isEnabled('cosmos')).toBe(false);
    });

    it('should get the variant of a service', () => {
      expect(registry.getVariant('redis')).toBe('test');
      expect(registry.getVariant('postgres')).toBe('test');
    });

    it('should get service configuration', () => {
      const redisConfig = registry.getServiceConfig('redis');
      expect(redisConfig).toHaveProperty('enabled', true);
      expect(redisConfig).toHaveProperty('variant', 'test');
      expect(redisConfig).toHaveProperty('connectionString');
    });

    it('should throw an error for non-existent service', () => {
      expect(() => registry.isEnabled('nonexistent')).toThrow('Service \'nonexistent\' not found in configuration');
      expect(() => registry.getVariant('nonexistent')).toThrow('Service \'nonexistent\' not found in configuration');
    });
  });

  describe('Integration', () => {
    it('should work with the singleton instance', async () => {
      await loadConfig(testConfigPath);
      
      // The singleton should be auto-initialized
      expect(serviceRegistry.isEnabled('redis')).toBe(true);
      expect(serviceRegistry.getVariant('redis')).toBe('test');
      
      // Test the convenience functions
      const { isEnabled, getVariant } = require('../services/registry');
      expect(isEnabled('redis')).toBe(true);
      expect(getVariant('redis')).toBe('test');
    });
  });
});
