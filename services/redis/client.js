const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const metrics = require('./metrics');
const { v4: uuidv4 } = require('uuid');

// Default configuration path
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/redis.json');

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
   */
  _initClient() {
    const { cluster, ...redisOptions } = this.config;
    
    if (cluster.enabled) {
      this.client = new Redis.Cluster(
        cluster.nodes,
        {
          scaleReads: 'slave', // Read from replicas when possible
          enableReadyCheck: true,
          ...redisOptions
        }
      );
    } else {
      this.client = new Redis(redisOptions);
    }
  }

  /**
   * Set up event listeners for the Redis client
   */
  _setupEventListeners() {
    this.client.on('connect', () => {
      this.connected = true;
      console.log(`[Redis] Connected to ${this.config.cluster?.enabled ? 'cluster' : 'standalone'} instance`);
    });

    this.client.on('ready', () => {
      console.log('[Redis] Client ready to accept commands');
    });

    this.client.on('error', (error) => {
      console.error('[Redis] Error:', error);
      metrics.recordError('connection', error);
    });

    this.client.on('end', () => {
      this.connected = false;
      console.log('[Redis] Connection closed');
    });

    this.client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });
  }

  /**
   * Load configuration from file
   * @param {string} configPath - Path to config file
   * @returns {Object} Configuration object
   */
  _loadConfig(configPath = DEFAULT_CONFIG_PATH) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Apply environment variable overrides
      if (process.env.REDIS_HOST) config.host = process.env.REDIS_HOST;
      if (process.env.REDIS_PORT) config.port = parseInt(process.env.REDIS_PORT, 10);
      if (process.env.REDIS_PASSWORD) config.password = process.env.REDIS_PASSWORD;
      if (process.env.REDIS_DB) config.db = parseInt(process.env.REDIS_DB, 10);
      
      return config;
    } catch (error) {
      console.error('Error loading Redis config:', error);
      throw new Error(`Failed to load Redis configuration: ${error.message}`);
    }
  }

  /**
   * Validate required options based on strategy
   */
  _validateOptions() {
    if (this.strategy === CACHE_STRATEGY.READ_THROUGH && typeof this.loader !== 'function') {
      throw new Error('Loader function is required for READ_THROUGH strategy');
    }
    
    if ((this.strategy === CACHE_STRATEGY.WRITE_THROUGH || 
         this.strategy === CACHE_STRATEGY.WRITE_BEHIND) && 
        typeof this.writer !== 'function') {
      throw new Error('Writer function is required for WRITE_THROUGH/WRITE_BEHIND strategy');
    }
  }

  /**
   * Execute a Redis command with metrics and error handling
   * @param {string} command - Redis command
   * @param {...any} args - Command arguments
   * @returns {Promise<any>} Command result
   */
  async _executeCommand(command, ...args) {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }

    const startTime = performance.now();
    
    try {
      const result = await this.client[command](...args);
      const duration = metrics.recordCommandTime(command, startTime);
      
      if (command.toLowerCase() === 'get') {
        if (result === null) {
          metrics.recordMiss();
        } else {
          metrics.recordHit();
        }
      } else if (command.toLowerCase() === 'set') {
        metrics.recordSet(args[0], args[2] || this.config.cacheOptions?.defaultTtl || 0);
      } else if (command.toLowerCase() === 'del') {
        metrics.recordDel(args[0]);
      }
      
      return result;
    } catch (error) {
      metrics.recordError(command, error);
      throw error;
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null if not found
   */
  async get(key) {
    const cacheKey = this._getCacheKey(key);
    const startTime = performance.now();
    
    try {
      // For READ_THROUGH strategy, use the loader on cache miss
      if (this.strategy === CACHE_STRATEGY.READ_THROUGH) {
        return this._readThrough(cacheKey);
      }
      
      // For other strategies, just get from cache
      const result = await this._executeCommand('get', cacheKey);
      
      if (result === null) {
        metrics.recordMiss();
        return null;
      }
      
      metrics.recordHit();
      return this._parseValue(result);
    } catch (error) {
      metrics.recordError('get', error);
      throw error;
    } finally {
      metrics.recordCommandTime('get', startTime);
    }
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: from config)
   * @returns {Promise<boolean>} True if successful
   */
  async set(key, value, ttl = null) {
    const cacheKey = this._getCacheKey(key);
    const ttlMs = ttl || this.config.cacheOptions?.defaultTtl || 0;
    const serialized = this._serializeValue(value);
    const startTime = performance.now();
    
    try {
      // For WRITE_THROUGH strategy, write to the underlying storage first
      if (this.strategy === CACHE_STRATEGY.WRITE_THROUGH && this.writer) {
        await this.writer(key, value);
      }
      
      // For WRITE_BEHIND, we'd typically use a queue, but for simplicity, we'll just write directly
      if (this.strategy === CACHE_STRATEGY.WRITE_BEHIND && this.writer) {
        // In a real implementation, this would be added to a queue
        setImmediate(() => {
          this.writer(key, value).catch(err => {
            console.error('Background write failed:', err);
          });
        });
      }
      
      // Set in Redis
      if (ttlMs > 0) {
        await this._executeCommand('set', cacheKey, serialized, 'EX', ttlMs);
      } else {
        await this._executeCommand('set', cacheKey, serialized);
      }
      
      metrics.recordSet(cacheKey, ttlMs);
      return true;
    } catch (error) {
      metrics.recordError('set', error);
      throw error;
    } finally {
      metrics.recordCommandTime('set', startTime);
    }
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key was deleted
   */
  async del(key) {
    const cacheKey = this._getCacheKey(key);
    try {
      const result = await this._executeCommand('del', cacheKey);
      return result > 0;
    } catch (error) {
      metrics.recordError('del', error);
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async mget(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return {};
    }
    
    const cacheKeys = keys.map(k => this._getCacheKey(k));
    const startTime = performance.now();
    
    try {
      const results = await this._executeCommand('mget', ...cacheKeys);
      const parsedResults = {};
      
      keys.forEach((key, index) => {
        if (results[index] !== null) {
          parsedResults[key] = this._parseValue(results[index]);
          metrics.recordHit();
        } else {
          metrics.recordMiss();
        }
      });
      
      return parsedResults;
    } catch (error) {
      metrics.recordError('mget', error);
      throw error;
    } finally {
      metrics.recordCommandTime('mget', startTime);
    }
  }

  /**
   * Set multiple keys at once
   * @param {Object} items - Key-value pairs to set
   * @param {number} ttl - Time to live in seconds (applies to all items)
   * @returns {Promise<boolean>} True if successful
   */
  async mset(items, ttl = null) {
    if (!items || typeof items !== 'object' || Object.keys(items).length === 0) {
      return false;
    }
    
    const pipeline = this.client.pipeline();
    const ttlMs = ttl || this.config.cacheOptions?.defaultTtl || 0;
    
    try {
      // For WRITE_THROUGH strategy, write to the underlying storage first
      if (this.strategy === CACHE_STRATEGY.WRITE_THROUGH && this.writer) {
        await this.writer(items);
      }
      
      // For WRITE_BEHIND, queue the write
      if (this.strategy === CACHE_STRATEGY.WRITE_BEHIND && this.writer) {
        setImmediate(() => {
          this.writer(items).catch(err => {
            console.error('Background batch write failed:', err);
          });
        });
      }
      
      // Add all items to the pipeline
      Object.entries(items).forEach(([key, value]) => {
        const cacheKey = this._getCacheKey(key);
        const serialized = this._serializeValue(value);
        
        if (ttlMs > 0) {
          pipeline.set(cacheKey, serialized, 'EX', ttlMs);
        } else {
          pipeline.set(cacheKey, serialized);
        }
        
        metrics.recordSet(cacheKey, ttlMs);
      });
      
      // Execute the pipeline
      await pipeline.exec();
      return true;
    } catch (error) {
      metrics.recordError('mset', error);
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async has(key) {
    const cacheKey = this._getCacheKey(key);
    try {
      const exists = await this._executeCommand('exists', cacheKey);
      return exists === 1;
    } catch (error) {
      metrics.recordError('exists', error);
      throw error;
    }
  }

  /**
   * Set key expiration
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} True if expiration was set
   */
  async expire(key, ttl) {
    const cacheKey = this._getCacheKey(key);
    try {
      const result = await this._executeCommand('expire', cacheKey, ttl);
      return result === 1;
    } catch (error) {
      metrics.recordError('expire', error);
      throw error;
    }
  }

  /**
   * Get time to live for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds, -2 if key doesn't exist, -1 if key exists but has no TTL
   */
  async ttl(key) {
    const cacheKey = this._getCacheKey(key);
    try {
      return await this._executeCommand('ttl', cacheKey);
    } catch (error) {
      metrics.recordError('ttl', error);
      throw error;
    }
  }

  /**
   * Flush all keys (use with caution in production!)
   * @returns {Promise<boolean>} True if successful
   */
  async flush() {
    try {
      await this._executeCommand('flushdb');
      return true;
    } catch (error) {
      metrics.recordError('flushdb', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    try {
      const [info, dbsize] = await Promise.all([
        this._executeCommand('info'),
        this._executeCommand('dbsize')
      ]);
      
      // Parse Redis INFO command output
      const infoLines = info.split('\r\n');
      const stats = {
        version: '',
        uptime: 0,
        connected_clients: 0,
        used_memory: 0,
        total_connections_received: 0,
        total_commands_processed: 0,
        keyspace_hits: 0,
        keyspace_misses: 0,
        dbsize: 0,
        metrics: metrics.getMetrics()
      };
      
      infoLines.forEach(line => {
        if (line.startsWith('redis_version:')) stats.version = line.split(':')[1];
        if (line.startsWith('uptime_in_seconds:')) stats.uptime = parseInt(line.split(':')[1], 10);
        if (line.startsWith('connected_clients:')) stats.connected_clients = parseInt(line.split(':')[1], 10);
        if (line.startsWith('used_memory:')) stats.used_memory = parseInt(line.split(':')[1], 10);
        if (line.startsWith('total_connections_received:')) stats.total_connections_received = parseInt(line.split(':')[1], 10);
        if (line.startsWith('total_commands_processed:')) stats.total_commands_processed = parseInt(line.split(':')[1], 10);
        if (line.startsWith('keyspace_hits:')) stats.keyspace_hits = parseInt(line.split(':')[1], 10);
        if (line.startsWith('keyspace_misses:')) stats.keyspace_misses = parseInt(line.split(':')[1], 10);
      });
      
      stats.dbsize = dbsize;
      
      return stats;
    } catch (error) {
      metrics.recordError('stats', error);
      throw error;
    }
  }

  /**
   * Close the Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  /**
   * Read-through cache pattern implementation
   * @private
   */
  async _readThrough(key) {
    // First try to get from cache
    const cached = await this._executeCommand('get', key);
    
    if (cached !== null) {
      metrics.recordHit();
      return this._parseValue(cached);
    }
    
    // Cache miss - load data using the provided loader
    metrics.recordMiss();
    
    if (!this.loader) {
      throw new Error('No loader function provided for read-through caching');
    }
    
    // Get the original key without the prefix
    const originalKey = this._getOriginalKey(key);
    
    // Load the data
    let data;
    try {
      data = await this.loader(originalKey);
    } catch (error) {
      metrics.recordError('loader', error);
      throw error;
    }
    
    // If we got data, cache it
    if (data !== null && data !== undefined) {
      const ttl = this.config.cacheOptions?.defaultTtl || 0;
      const serialized = this._serializeValue(data);
      
      if (ttl > 0) {
        await this._executeCommand('set', key, serialized, 'EX', ttl);
      } else {
        await this._executeCommand('set', key, serialized);
      }
      
      metrics.recordSet(key, ttl);
    }
    
    return data;
  }

  /**
   * Generate a cache key with prefix
   * @private
   */
  _getCacheKey(key) {
    const prefix = this.config.keyPrefix || '';
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Get the original key without the prefix
   * @private
   */
  _getOriginalKey(key) {
    const prefix = this.config.keyPrefix || '';
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
