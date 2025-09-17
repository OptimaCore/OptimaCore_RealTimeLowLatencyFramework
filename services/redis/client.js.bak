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
   */
  _initClient() {
    const { cluster, connection, retry } = this.config;
    
    // Prepare common Redis options
    const redisOptions = {
      ...connection,
      retryStrategy: (times) => {
        if (times > retry.maxRetries) {
          return null; // Stop retrying after max retries
        }
        const delay = Math.min(
          retry.initialDelay * Math.pow(retry.factor, times - 1) * (1 + Math.random() * retry.jitter),
          retry.maxDelay
        );
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY" for read-only replicas
          return true;
        }
        return false;
      },
      enableOfflineQueue: this.config.cache.enableOfflineQueue,
      maxRetriesPerRequest: this.config.cache.maxRetriesPerRequest,
      keyPrefix: connection.keyPrefix,
      tls: connection.tls.enabled ? {
        servername: connection.tls.servername,
        rejectUnauthorized: true,
        requestCert: true,
        agent: false
      } : undefined
    };
    
    if (cluster.enabled) {
      // Initialize Redis Cluster client
      this.client = new Redis.Cluster(
        cluster.nodes,
        {
          ...redisOptions,
          ...cluster.options,
          // Azure Redis requires these settings for clustering
          dnsLookup: (address, callback) => callback(null, address), // Bypass DNS resolution
          redisOptions: {
            ...redisOptions,
            // Override any options that shouldn't be at the cluster level
            enableOfflineQueue: false,
            maxRetriesPerRequest: null
          }
        }
      );
    } else {
      // Initialize standalone Redis client
      this.client = new Redis(redisOptions);
    }
    
    // Add Azure Redis specific event handlers
    this._setupAzureEventHandlers();
  }
  
  _setupAzureEventHandlers() {
    if (!this._isAzureRedis(this.config)) return;
    
    // Handle connection errors specifically for Azure
    this.client.on('error', (error) => {
      console.error('Azure Redis error:', error.message);
      
      // Handle common Azure Redis errors
      if (error.message.includes('WRONGPASS') || error.message.includes('AUTH')) {
        console.error('Authentication failed. Please check your access key and username (cache name).');
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
        console.error('Connection failed. Please check your host and port, and ensure the Azure Cache is running.');
      } else if (error.message.includes('READONLY')) {
        console.warn('Read-only replica. Attempting to reconnect to primary...');
      }
      
      metrics.recordError('connection', error);
    });
    
    // Log successful reconnections
    this.client.on('reconnecting', () => {
      console.log('Reconnecting to Azure Redis...');
    });
    
    // Handle failover events in cluster mode
    if (this.config.cluster.enabled) {
      this.client.on('+node', (node) => {
        console.log(`New node connected: ${node.options.host}:${node.options.port}`);
      });
      
      this.client.on('-node', (node) => {
        console.warn(`Node disconnected: ${node.options.host}:${node.options.port}`);
      });
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
      let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Apply environment variable overrides
      this._applyEnvOverrides(config);
      
      // Process connection string if provided (takes precedence over individual settings)
      if (config.connection.connectionString) {
        this._processConnectionString(config);
      }
      
      // Set default TLS settings for Azure Redis
      if (this._isAzureRedis(config)) {
        this._applyAzureRedisDefaults(config);
      }
      
      return config;
    } catch (error) {
      console.error('Error loading Redis config:', error);
      throw new Error(`Failed to load Redis configuration: ${error.message}`);
    }
  }
  
  _applyEnvOverrides(config) {
    // Connection settings
    if (process.env.REDIS_HOST) config.connection.host = process.env.REDIS_HOST;
    if (process.env.REDIS_PORT) config.connection.port = parseInt(process.env.REDIS_PORT, 10);
    if (process.env.REDIS_USERNAME) config.connection.username = process.env.REDIS_USERNAME;
    if (process.env.REDIS_PASSWORD) config.connection.password = process.env.REDIS_PASSWORD;
    if (process.env.REDIS_DB) config.connection.db = parseInt(process.env.REDIS_DB, 10);
    
    // Azure settings
    if (process.env.AZURE_REDIS_CACHE_NAME) config.azure.cacheName = process.env.AZURE_REDIS_CACHE_NAME;
    if (process.env.AZURE_REDIS_ACCESS_KEY) config.connection.password = process.env.AZURE_REDIS_ACCESS_KEY;
    
    // TLS settings
    if (process.env.REDIS_TLS_ENABLED !== undefined) {
      config.connection.tls.enabled = process.env.REDIS_TLS_ENABLED === 'true';
    }
  }
  
  _processConnectionString(config) {
    try {
      const connStr = config.connection.connectionString;
      if (!connStr) return;
      
      // Handle Azure Redis connection string format
      if (connStr.includes('@')) {
        // Format: redis://username:password@host:port
        const url = new URL(connStr);
        config.connection.host = url.hostname;
        config.connection.port = parseInt(url.port, 10) || 
          (url.protocol === 'rediss:' ? AZURE_REDIS_PORTS.ssl : AZURE_REDIS_PORTS.nonSsl);
        config.connection.username = url.username || '';
        config.connection.password = url.password || '';
        config.connection.tls.enabled = url.protocol === 'rediss:';
      } else {
        // Format: host:port:password
        const parts = connStr.split(':');
        if (parts.length >= 2) {
          config.connection.host = parts[0];
          config.connection.port = parseInt(parts[1], 10);
          if (parts[2]) config.connection.password = parts[2];
        }
      }
    } catch (error) {
      console.warn('Failed to parse connection string:', error);
    }
  }
  
  _isAzureRedis(config) {
    return (
      config.connection.host.endsWith('.redis.cache.windows.net') ||
      config.connection.host.endsWith('.redis.cache.chinacloudapi.cn') ||
      config.connection.host.endsWith('.redis.cache.usgovcloudapi.net') ||
      config.connection.host.endsWith('.redis.cache.cloudapi.de') ||
      config.azure.cacheName
    );
  }
  
  _applyAzureRedisDefaults(config) {
    // Azure Redis requires TLS by default
    config.connection.tls.enabled = true;
    
    // Set default port if not specified
    if (!config.connection.port) {
      config.connection.port = config.connection.tls.enabled ? 
        AZURE_REDIS_PORTS.ssl : AZURE_REDIS_PORTS.nonSsl;
    }
    
    // Use cache name as username if not specified (Azure requirement)
    if (!config.connection.username && config.azure.cacheName) {
      config.connection.username = config.azure.cacheName;
    }
    
    // Set servername for TLS validation
    if (config.connection.tls.enabled && !config.connection.tls.servername) {
      config.connection.tls.servername = config.connection.host;
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
      let info, dbsize;
      
      // For Azure Redis, we need to handle both cluster and non-cluster modes
      if (this.config.cluster.enabled && this.client.isCluster) {
        // Get info from all nodes in the cluster
        const nodes = this.client.nodes();
        const nodeInfos = await Promise.all(
          nodes.map(node => 
            node.info().catch(err => ({
              error: err.message,
              node: `${node.options.host}:${node.options.port}`
            }))
          )
        );
        
        // Get the first successful info response
        info = nodeInfos.find(info => !info.error) || '';
        dbsize = await this._executeCommand('dbsize');
      } else {
        // Standard Redis info command
        [info, dbsize] = await Promise.all([
          this._executeCommand('info'),
          this._executeCommand('dbsize')
        ]);
      }
      
      // Parse Redis INFO command output
      const infoLines = typeof info === 'string' ? info.split('\r\n') : [];
      const stats = {
        version: '',
        mode: this.config.cluster.enabled ? 'cluster' : 'standalone',
        uptime: 0,
        connected_clients: 0,
        used_memory: 0,
        total_connections_received: 0,
        total_commands_processed: 0,
        keyspace_hits: 0,
        keyspace_misses: 0,
        dbsize: dbsize || 0,
        metrics: metrics.getMetrics(),
        azure: {
          cacheName: this.config.azure.cacheName,
          sku: this.config.azure.skuName,
          shardCount: this.config.azure.shardCount,
          tlsVersion: this.config.azure.minimumTlsVersion
        },
        isAzure: this._isAzureRedis(this.config)
      };
      
      // Parse INFO command output
      infoLines.forEach(line => {
        if (!line || line.startsWith('#')) return;
        
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        
        switch (key) {
          case 'redis_version':
            stats.version = value;
            break;
          case 'uptime_in_seconds':
            stats.uptime = parseInt(value, 10);
            break;
          case 'connected_clients':
            stats.connected_clients = parseInt(value, 10);
            break;
          case 'used_memory':
            stats.used_memory = parseInt(value, 10);
            break;
          case 'total_connections_received':
            stats.total_connections_received = parseInt(value, 10);
            break;
          case 'total_commands_processed':
            stats.total_commands_processed = parseInt(value, 10);
            break;
          case 'keyspace_hits':
            stats.keyspace_hits = parseInt(value, 10);
            break;
          case 'keyspace_misses':
            stats.keyspace_misses = parseInt(value, 10);
            break;
          case 'role':
            stats.role = value;
            break;
          case 'connected_slaves':
            stats.connected_slaves = parseInt(value, 10);
            break;
          case 'used_memory_rss':
            stats.used_memory_rss = parseInt(value, 10);
            break;
          case 'used_memory_peak':
            stats.used_memory_peak = parseInt(value, 10);
            break;
        }
      });
      
      // Calculate hit ratio if we have hits and misses
      if (stats.keyspace_hits > 0 || stats.keyspace_misses > 0) {
        stats.hit_ratio = (stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses)) * 100;
      } else {
        stats.hit_ratio = 0;
      }
      
      // Add Azure-specific metrics if available
      if (this._isAzureRedis(this.config)) {
        stats.azure.connected = this.client.status === 'ready';
        stats.azure.connectionString = this._getMaskedConnectionString();
      }
      
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
    if (!this.client) return;
    
    try {
      // For cluster, disconnect all nodes
      if (this.config.cluster.enabled && this.client.disconnect) {
        this.client.disconnect();
      } else if (this.client.quit) {
        // For standalone, send QUIT command
        await this.client.quit();
      }
    } catch (error) {
      console.error('Error closing Redis connection:', error);
      // Force close if graceful shutdown fails
      if (this.client.disconnect) {
        this.client.disconnect();
      }
    } finally {
      this.connected = false;
      this.client = null;
    }
  }
  
  _getMaskedConnectionString() {
    if (!this.config.connection.connectionString) return '';
    
    try {
      // Mask password in connection string
      const url = new URL(this.config.connection.connectionString);
      if (url.password) {
        url.password = '*****';
      }
      return url.toString();
    } catch (e) {
      // For non-URL connection strings, just return a masked version
      const parts = this.config.connection.connectionString.split(':');
      if (parts.length > 2) {
        parts[2] = '*****';
        return parts.join(':');
      }
      return '*****';
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
    const cached = await this.get(key);
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
        await this.set(key, data, ttl);
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
      await this.set(key, value, ttl);
      
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
      await this.set(key, value, ttl);
      
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
