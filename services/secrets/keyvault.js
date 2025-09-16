const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { logger } = require('../../services/telemetry');
const fs = require('fs');
const path = require('path');

class KeyVaultService {
  constructor() {
    this.keyVaultUrl = process.env.AZURE_KEY_VAULT_URI;
    this.secrets = new Map();
    this.secretClient = null;
    this.localSecretsFile = path.join(__dirname, '../../../.secrets.json');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Try to connect to Azure Key Vault if URL is provided
      if (this.keyVaultUrl) {
        const credential = new DefaultAzureCredential({
          // Workaround for local development
          // In production, use managed identity or service principal
          excludeEnvironmentCredential: false,
          excludeManagedIdentityCredential: false,
          excludeVisualStudioCodeCredential: true,
          excludeSharedTokenCacheCredential: true,
          excludeAzureCliCredential: false,
          excludePowerShellCredential: true
        });

        this.secretClient = new SecretClient(this.keyVaultUrl, credential);
        logger.info(`Connected to Azure Key Vault: ${this.keyVaultUrl}`);
      } else {
        logger.warn('No AZURE_KEY_VAULT_URI provided, using local secrets file');
      }

      // Load local secrets if they exist
      await this.loadLocalSecrets();
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize Key Vault client', { error: error.message });
      throw error;
    }
  }

  async loadLocalSecrets() {
    try {
      if (fs.existsSync(this.localSecretsFile)) {
        const data = JSON.parse(fs.readFileSync(this.localSecretsFile, 'utf8'));
        this.secrets = new Map(Object.entries(data));
        logger.info(`Loaded ${this.secrets.size} secrets from local file`);
      } else {
        logger.info('No local secrets file found, starting with empty secrets');
      }
    } catch (error) {
      logger.error('Failed to load local secrets', { error: error.message });
      throw error;
    }
  }

  async saveLocalSecrets() {
    try {
      const data = Object.fromEntries(this.secrets);
      fs.writeFileSync(this.localSecretsFile, JSON.stringify(data, null, 2), 'utf8');
      logger.debug(`Saved ${this.secrets.size} secrets to local file`);
    } catch (error) {
      logger.error('Failed to save local secrets', { error: error.message });
      throw error;
    }
  }

  async getSecret(name, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const { throwIfNotFound = true, defaultValue = null } = options;
    
    try {
      // Check in-memory cache first
      if (this.secrets.has(name)) {
        return this.secrets.get(name);
      }
      
      // Try to get from Azure Key Vault
      if (this.secretClient) {
        try {
          const secret = await this.secretClient.getSecret(name);
          const value = secret.value;
          
          // Cache the value
          this.secrets.set(name, value);
          
          // Also update local file for offline development
          await this.saveLocalSecrets();
          
          return value;
        } catch (error) {
          // If secret not found and we have a default, return that
          if (error.code === 'SecretNotFound' && !throwIfNotFound) {
            return defaultValue;
          }
          throw error;
        }
      }
      
      // Not found in cache or Key Vault, and no default provided
      if (throwIfNotFound) {
        throw new Error(`Secret not found: ${name}`);
      }
      
      return defaultValue;
    } catch (error) {
      logger.error(`Failed to get secret: ${name}`, { error: error.message });
      
      if (error.code === 'SecretNotFound' && !throwIfNotFound) {
        return defaultValue;
      }
      
      throw error;
    }
  }

  async setSecret(name, value, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const { saveToKeyVault = true, saveToLocal = true } = options;
    
    try {
      // Update in-memory cache
      this.secrets.set(name, value);
      
      // Save to Azure Key Vault if configured
      if (saveToKeyVault && this.secretClient) {
        await this.secretClient.setSecret(name, value);
        logger.debug(`Saved secret to Key Vault: ${name}`);
      }
      
      // Save to local file if enabled
      if (saveToLocal) {
        await this.saveLocalSecrets();
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to set secret: ${name}`, { error: error.message });
      throw error;
    }
  }

  async deleteSecret(name) {
    if (!this.initialized) await this.initialize();
    
    try {
      // Remove from in-memory cache
      this.secrets.delete(name);
      
      // Delete from Azure Key Vault if configured
      if (this.secretClient) {
        await this.secretClient.beginDeleteSecret(name);
        logger.debug(`Deleted secret from Key Vault: ${name}`);
      }
      
      // Update local file
      await this.saveLocalSecrets();
      
      return true;
    } catch (error) {
      logger.error(`Failed to delete secret: ${name}`, { error: error.message });
      throw error;
    }
  }

  async listSecrets() {
    if (!this.initialized) await this.initialize();
    
    try {
      const secrets = [];
      
      // Get from Azure Key Vault if configured
      if (this.secretClient) {
        for await (const secretProperties of this.secretClient.listPropertiesOfSecrets()) {
          try {
            const secret = await this.secretClient.getSecret(secretProperties.name);
            secrets.push({
              name: secretProperties.name,
              value: secret.value,
              enabled: secretProperties.enabled,
              createdOn: secretProperties.createdOn,
              updatedOn: secretProperties.updatedOn
            });
          } catch (error) {
            logger.warn(`Failed to fetch secret: ${secretProperties.name}`, { error: error.message });
          }
        }
      }
      
      // Add any local secrets not in Key Vault
      for (const [name, value] of this.secrets) {
        if (!secrets.some(s => s.name === name)) {
          secrets.push({
            name,
            value,
            source: 'local',
            enabled: true
          });
        }
      }
      
      return secrets;
    } catch (error) {
      logger.error('Failed to list secrets', { error: error.message });
      throw error;
    }
  }
}

// Create a singleton instance
const keyvault = new KeyVaultService();

// Initialize the service when this module is imported
keyvault.initialize().catch(error => {
  logger.error('Failed to initialize Key Vault service', { error: error.message });
  process.exit(1);
});

module.exports = keyvault;
