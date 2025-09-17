const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

// Default configuration path
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/redis.json');

// Azure Redis Cache default ports
const AZURE_REDIS_PORTS = {
  nonSsl: 6379,
  ssl: 6380
};

// Cache strategies
const CACHE_STRATEGY = {
  CACHE_ASIDE: 'CACHE_ASIDE',
  READ_THROUGH: 'READ_THROUGH',
  WRITE_THROUGH: 'WRITE_THROUGH',
  WRITE_BEHIND: 'WRITE_BEHIND'
};

class RedisClient {
  /**
   * Create a new Redis client
   * @param {Object} options - Configuration options
   * @param {string} options.configPath - Path to Redis config file
   * @param {string} options.strategy - Cache strategy (default: CACHE_ASIDE)
   * @param {Function} options.loader - Function to load data on cache miss (required for READ_THROUGH)
   * @param {Function} options.writer - Function to write data (required for WRITE_THROUGH/WRITE_BEHIND)
   */
  constructor(options = {}) {
    this.config = this._loadConfig(options.configPath);
    this.strategy = options.strategy || CACHE_STRATEGY.CACHE_ASIDE;
    this.loader = options.loader;
    this.writer = options.writer;
    this.client = null;
    this.connected = false;
    this.connectionId = uuidv4();
    
    this._validateOptions();
    this._initClient();
    this._setupEventListeners();
  }

  /**
   * Initialize Redis client based on configuration
   * @private
   */
  _initClient() {
    const { host, port, tls, password, db } = this.config.connection;
    
    const clientOptions = {
      host,
      port: port || 6379,
      password,
      db: db || 0,
      retryStrategy: this.retryStrategy.bind(this),
      reconnectOnError: this.reconnectOnError.bind(this),
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,
      ...(this.config.options || {})
    };

    // Handle TLS/SSL
    if (tls) {
      clientOptions.tls = typeof tls === 'object' ? tls : {};
    }

    // Handle Azure Redis
    if (this._isAzureRedis(this.config)) {
      this._applyAzureRedisDefaults(clientOptions);
    }

    this.client = new Redis(clientOptions);
  }

  /**
   * Retry strategy for reconnections
   * @private
   */
  retryStrategy(times) {
    const delay = Math.min(times * 100, 5000);
    return delay;
  }

  /**
   * Handle reconnection on error
   * @private
   */
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect on READONLY error
    }
    return false;
  }

  /**
   * Set up event listeners for the Redis client
   * @private
   */
  _setupEventListeners() {
    this.client.on('connect', () => {
      this.connected = true;
      console.log(`Redis client connected (${this.connectionId})`);
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
    });

    this.client.on('error', (err) => {
      console.error('Redis error:', err);
      metrics.increment('redis.errors', { type: 'client_error' });
    });

    this.client.on('reconnecting', (delay) => {
      console.log(`Reconnecting to Redis in ${delay}ms`);
      metrics.increment('redis.reconnects');
    });

    this.client.on('end', () => {
      this.connected = false;
      console.log('Redis connection closed');
    });
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.forceReadThrough=false] - Force read-through even if not default strategy
   * @returns {Promise<any>} Cached value or loaded value if using read-through
   */
  async get(key, { forceReadThrough = false } = {}) {
    const cacheKey = this._getCacheKey(key);
    
    // If using read-through strategy or forced, use read-through pattern
    if (this.strategy === CACHE_STRATEGY.READ_THROUGH || forceReadThrough) {
      return this._readThrough(cacheKey);
    }
    
    // Standard get operation
    try {
      const result = await this._executeCommand('get', cacheKey);
      if (result === null) {
        metrics.increment('redis.cache.miss', { strategy: 'standard' });
        return null;
      }
      
      metrics.increment('redis.cache.hit', { strategy: 'standard' });
      return this._parseValue(result);
    } catch (error) {
      metrics.increment('redis.cache.error', { 
        operation: 'get', 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number|Object} [options] - TTL in seconds or options object
   * @param {number} [options.ttl] - Time to live in seconds
   * @param {boolean} [options.forceWriteThrough=false] - Force write-through even if not default strategy
   * @param {boolean} [options.forceWriteBehind=false] - Force write-behind even if not default strategy
   * @returns {Promise<boolean>} True if successful
   */
  async set(key, value, options = {}) {
    // Handle both simple TTL and options object
    const ttl = typeof options === 'number' ? options : (options.ttl ?? null);
    const forceWriteThrough = options.forceWriteThrough || false;
    const forceWriteBehind = options.forceWriteBehind || false;
    
    const cacheKey = this._getCacheKey(key);
    const ttlToUse = ttl ?? this.config.cacheOptions?.defaultTtl;
    
    // Handle write-through strategy
    if (this.strategy === CACHE_STRATEGY.WRITE_THROUGH || forceWriteThrough) {
      return this._writeThrough(cacheKey, value, ttlToUse);
    }
    
    // Handle write-behind strategy
    if (this.strategy === CACHE_STRATEGY.WRITE_BEHIND || forceWriteBehind) {
      return this._writeBehind(cacheKey, value, ttlToUse);
    }
    
    // Standard set operation
    try {
      const serialized = this._serializeValue(value);
      
      if (ttlToUse > 0) {
        await this._executeCommand('set', cacheKey, serialized, 'EX', ttlToUse);
      } else {
        await this._executeCommand('set', cacheKey, serialized);
      }
      
      metrics.increment('redis.cache.set', { 
        strategy: 'standard',
        ttl: ttlToUse || 0
      });
      
      return true;
    } catch (error) {
      metrics.increment('redis.cache.error', { 
        operation: 'set', 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Read-through cache pattern implementation
   * @private
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached or loaded value
   */
  async _readThrough(key) {
    // Try to get from cache first
    const cached = await this.get(key, { forceReadThrough: false });
    if (cached !== null) {
      metrics.increment('redis.cache.hit', { strategy: 'read_through' });
      return cached;
    }
    
    // Cache miss - load data using the provided loader
    metrics.increment('redis.cache.miss', { strategy: 'read_through' });
    
    if (!this.loader) {
      throw new Error('No loader function provided for read-through caching');
    }
    
    // Get the original key without the prefix
    const originalKey = this._getOriginalKey(key);
    
    // Load the data
    let data;
    try {
      data = await this.loader(originalKey);
      
      // If we got data, cache it
      if (data !== null && data !== undefined) {
        const ttl = this.config.cacheOptions?.defaultTtl || 0;
        await this.set(key, data, { ttl, forceWriteThrough: false });
        metrics.increment('redis.cache.set', { strategy: 'read_through' });
      }
      
      return data;
    } catch (error) {
      metrics.increment('redis.cache.error', { 
        strategy: 'read_through', 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Write-through cache pattern implementation
   * @private
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttl] - Optional TTL in seconds
   * @returns {Promise<boolean>} True if successful
   */
  async _writeThrough(key, value, ttl = null) {
    if (!this.writer) {
      throw new Error('No writer function provided for write-through caching');
    }
    
    try {
      // Get the original key without the prefix
      const originalKey = this._getOriginalKey(key);
      
      // First write to the data store
      await this.writer(originalKey, value);
      
      // Then update the cache
      await this.set(key, value, { ttl, forceWriteThrough: false });
      
      metrics.increment('redis.cache.write', { strategy: 'write_through' });
      return true;
    } catch (error) {
      metrics.increment('redis.cache.error', { 
        strategy: 'write_through', 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Write-behind cache pattern implementation
   * @private
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttl] - Optional TTL in seconds
   * @returns {Promise<boolean>} True if successful
   */
  async _writeBehind(key, value, ttl = null) {
    if (!this.writer) {
      throw new Error('No writer function provided for write-behind caching');
    }
    
    try {
      // First update the cache
      await this.set(key, value, { ttl, forceWriteBehind: false });
      
      // Get the original key without the prefix
      const originalKey = this._getOriginalKey(key);
      
      // Then asynchronously write to the data store
      this.writer(originalKey, value)
        .then(() => {
          metrics.increment('redis.cache.write', { strategy: 'write_behind' });
        })
        .catch(error => {
          console.error('Write-behind error:', error);
          metrics.increment('redis.cache.error', { 
            strategy: 'write_behind', 
            error: error.message 
          });
        });
      
      return true;
    } catch (error) {
      metrics.increment('redis.cache.error', { 
        strategy: 'write_behind', 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Execute a Redis command with error handling and metrics
   * @private
   */
  async _executeCommand(command, ...args) {
    const startTime = Date.now();
    
    try {
      const result = await this.client[command](...args);
      const duration = Date.now() - startTime;
      
      // Record command metrics
      metrics.timing('redis.command', duration, { command });
      metrics.increment('redis.commands', { command, status: 'success' });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record error metrics
      metrics.timing('redis.command', duration, { command, error: error.code || 'unknown' });
      metrics.increment('redis.commands', { 
        command, 
        status: 'error',
        error: error.code || 'unknown'
      });
      
      throw error;
    }
  }
  
  /**
   * Load configuration from file and apply environment overrides
   * @private
   */
  _loadConfig(configPath = DEFAULT_CONFIG_PATH) {
    try {
      let config = {};
      
      // Load from file if it exists
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      
      // Apply environment variable overrides
      this._applyEnvOverrides(config);
      
      // Process connection string if provided
      if (config.connection?.connectionString) {
        this._processConnectionString(config);
      }
      
      // Apply Azure-specific defaults if needed
      if (this._isAzureRedis(config)) {
        this._applyAzureRedisDefaults(config);
      }
      
      return config;
    } catch (error) {
      console.error('Error loading Redis config:', error);
      throw new Error(`Failed to load Redis configuration: ${error.message}`);
    }
  }
  
  /**
   * Apply environment variable overrides to config
   * @private
   */
  _applyEnvOverrides(config) {
    if (process.env.REDIS_HOST) config.connection = config.connection || {};
    if (process.env.REDIS_HOST) config.connection.host = process.env.REDIS_HOST;
    if (process.env.REDIS_PORT) config.connection.port = parseInt(process.env.REDIS_PORT, 10);
    if (process.env.REDIS_PASSWORD) config.connection.password = process.env.REDIS_PASSWORD;
    if (process.env.REDIS_DB) config.connection.db = parseInt(process.env.REDIS_DB, 10);
    if (process.env.REDIS_TLS === 'true') config.connection.tls = {};
    
    // Cache options
    if (process.env.REDIS_KEY_PREFIX) {
      config.cacheOptions = config.cacheOptions || {};
      config.cacheOptions.keyPrefix = process.env.REDIS_KEY_PREFIX;
    }
    
    if (process.env.REDIS_DEFAULT_TTL) {
      config.cacheOptions = config.cacheOptions || {};
      config.cacheOptions.defaultTtl = parseInt(process.env.REDIS_DEFAULT_TTL, 10);
    }
    
    return config;
  }
  
  /**
   * Process connection string into config properties
   * @private
   */
  _processConnectionString(config) {
    try {
      const url = new URL(config.connection.connectionString);
      
      config.connection = config.connection || {};
      config.connection.host = url.hostname;
      config.connection.port = url.port || (url.protocol === 'rediss:' ? 6380 : 6379);
      
      if (url.username) {
        config.connection.username = decodeURIComponent(url.username);
      }
      
      if (url.password) {
        config.connection.password = decodeURIComponent(url.password);
      }
      
      if (url.pathname && url.pathname.length > 1) {
        const db = parseInt(url.pathname.substring(1), 10);
        if (!isNaN(db)) {
          config.connection.db = db;
        }
      }
      
      if (url.protocol === 'rediss:') {
        config.connection.tls = {};
      }
      
      return config;
    } catch (error) {
      console.error('Error processing connection string:', error);
      throw new Error(`Invalid Redis connection string: ${error.message}`);
    }
  }
  
  /**
   * Check if the config is for Azure Redis
   * @private
   */
  _isAzureRedis(config) {
    return (
      config.connection?.host?.endsWith('.redis.cache.windows.net') ||
      config.connection?.host?.endsWith('.redis.cache.chinacloudapi.cn') ||
      config.connection?.host?.endsWith('.redis.cache.usgovcloudapi.net') ||
      config.connection?.host?.endsWith('.redis.cache.cloudapi.de')
    );
  }
  
  /**
   * Apply Azure Redis specific defaults
   * @private
   */
  _applyAzureRedisDefaults(config) {
    // Enable TLS by default for Azure Redis
    if (config.connection.tls === undefined) {
      config.connection.tls = {};
    }
    
    // Set default port if not specified
    if (!config.connection.port) {
      config.connection.port = config.connection.tls ? AZURE_REDIS_PORTS.ssl : AZURE_REDIS_PORTS.nonSsl;
    }
    
    // Add Azure-specific options
    config.options = config.options || {};
    
    // Enable auto-reconnect
    config.options.retryStrategy = config.options.retryStrategy || this.retryStrategy.bind(this);
    
    // Enable auto-resubscribe
    config.options.enableReadyCheck = true;
    
    // Set connection name for monitoring
    if (!config.options.connectionName) {
      const appName = process.env.npm_package_name || 'optima-core';
      config.options.connectionName = `${appName}-${this.connectionId.substring(0, 8)}`;
    }
    
    return config;
  }
  
  /**
   * Validate required options based on strategy
   * @private
   */
  _validateOptions() {
    if (this.strategy === CACHE_STRATEGY.READ_THROUGH && typeof this.loader !== 'function') {
      throw new Error('Loader function is required for READ_THROUGH strategy');
    }
    
    if (
      (this.strategy === CACHE_STRATEGY.WRITE_THROUGH || 
       this.strategy === CACHE_STRATEGY.WRITE_BEHIND) && 
      typeof this.writer !== 'function'
    ) {
      throw new Error('Writer function is required for WRITE_THROUGH/WRITE_BEHIND strategy');
    }
    
    if (!Object.values(CACHE_STRATEGY).includes(this.strategy)) {
      throw new Error(`Invalid cache strategy: ${this.strategy}`);
    }
  }
  
  /**
   * Generate a cache key with prefix
   * @private
   */
  _getCacheKey(key) {
    const prefix = this.config.cacheOptions?.keyPrefix || '';
    return prefix ? `${prefix}:${key}` : key;
  }
  
  /**
   * Get the original key without the prefix
   * @private
   */
  _getOriginalKey(key) {
    const prefix = this.config.cacheOptions?.keyPrefix || '';
    if (prefix && key.startsWith(prefix)) {
      return key.substring(prefix.length + 1); // +1 for the ':'
    }
    return key;
  }
  
  /**
   * Serialize a value for storage
   * @private
   */
  _serializeValue(value) {
    if (value === undefined) {
      return '__undefined__';
    }
    return JSON.stringify(value);
  }
  
  /**
   * Parse a stored value
   * @private
   */
  _parseValue(value) {
    if (value === null) return null;
    if (value === '__undefined__') return undefined;
    try {
      return JSON.parse(value);
    } catch (e) {
      return value; // Return as-is if not JSON
    }
  }
}

// Export the CACHE_STRATEGY enum
RedisClient.STRATEGY = CACHE_STRATEGY;

module.exports = RedisClient;
