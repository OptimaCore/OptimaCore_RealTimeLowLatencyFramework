const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const config = require('../config/loader');
const logger = require('./logger');

class KeyVaultService {
  constructor() {
    this.client = null;
    this.secrets = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (!config.azure.keyVault.uri) {
      logger.warn('Azure Key Vault URI not configured. Key Vault integration will be disabled.');
      this.initialized = false;
      return;
    }

    try {
      const credential = new DefaultAzureCredential({
        // In development, you can use environment variables or managed identity
        // In production, this will automatically use managed identity in Azure
        // For local development, you can set these environment variables:
        // AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
      });

      this.client = new SecretClient(config.azure.keyVault.uri, credential);
      
      // Test the connection
      await this.client.getPropertiesOfSecrets().next();
      
      this.initialized = true;
      logger.info('Azure Key Vault client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Azure Key Vault client:', error.message);
      this.initialized = false;
      throw error;
    }
  }

  async getSecret(secretName, useCache = true) {
    if (!this.initialized) {
      throw new Error('Key Vault client is not initialized');
    }

    // Return cached secret if available
    if (useCache && this.secrets.has(secretName)) {
      return this.secrets.get(secretName);
    }

    try {
      const secret = await this.client.getSecret(secretName);
      
      // Cache the secret
      this.secrets.set(secretName, secret.value);
      
      return secret.value;
    } catch (error) {
      logger.error(`Failed to fetch secret ${secretName} from Key Vault:`, error.message);
      throw error;
    }
  }

  async setSecret(secretName, secretValue, options = {}) {
    if (!this.initialized) {
      throw new Error('Key Vault client is not initialized');
    }

    try {
      const result = await this.client.setSecret(secretName, secretValue, options);
      
      // Update cache
      this.secrets.set(secretName, secretValue);
      
      return result;
    } catch (error) {
      logger.error(`Failed to set secret ${secretName} in Key Vault:`, error.message);
      throw error;
    }
  }

  async deleteSecret(secretName) {
    if (!this.initialized) {
      throw new Error('Key Vault client is not initialized');
    }

    try {
      const poller = await this.client.beginDeleteSecret(secretName);
      await poller.pollUntilDone();
      
      // Remove from cache
      this.secrets.delete(secretName);
      
      return true;
    } catch (error) {
      // Ignore if secret doesn't exist
      if (error.code === 'SecretNotFound') {
        return false;
      }
      
      logger.error(`Failed to delete secret ${secretName} from Key Vault:`, error.message);
      throw error;
    }
  }

  async getSecretsByPrefix(prefix) {
    if (!this.initialized) {
      throw new Error('Key Vault client is not initialized');
    }

    try {
      const secrets = [];
      
      for await (const secretProperties of this.client.listPropertiesOfSecrets()) {
        if (secretProperties.name.startsWith(prefix)) {
          const secret = await this.getSecret(secretProperties.name);
          secrets.push({
            name: secretProperties.name,
            value: secret,
            properties: secretProperties
          });
        }
      }
      
      return secrets;
    } catch (error) {
      logger.error(`Failed to list secrets with prefix ${prefix} from Key Vault:`, error.message);
      throw error;
    }
  }
}

// Create a singleton instance
const keyVault = new KeyVaultService();

// Initialize Key Vault if enabled
if (config.features.enableAzureKeyVault) {
  keyVault.initialize().catch(error => {
    logger.error('Failed to initialize Key Vault:', error);
  });
}

module.exports = keyVault;
