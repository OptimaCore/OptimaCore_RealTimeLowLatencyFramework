const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/loader');
const logger = require('../../utils/logger').logger;

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.connectionId = uuidv4();
    this.isConnected = false;
    this.initialize();
  }

  initialize() {
    try {
      // Use connection string if provided, otherwise use individual parameters
      if (config.redis.connectionString) {
        this.client = new Redis(config.redis.connectionString, {
          retryStrategy: this._getRetryStrategy(),
          enableReadyCheck: true,
          connectTimeout: 10000,
          maxRetriesPerRequest: 3,
          reconnectOnError: (err) => {
            logger.warn('Redis reconnecting on error', {
              error: err.message,
              connectionId: this.connectionId,
            });
            return true; // Reconnect on all errors
          },
        });
      } else {
        this.client = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
          tls: config.redis.tls ? {} : undefined,
          retryStrategy: this._getRetryStrategy(),
          enableReadyCheck: true,
          connectTimeout: 10000,
          maxRetriesPerRequest: 3,
          reconnectOnError: (err) => {
            logger.warn('Redis reconnecting on error', {
              error: err.message,
              connectionId: this.connectionId,
            });
            return true; // Reconnect on all errors
          },
        });
      }

      // Create separate pub/sub clients if needed
      this.pubClient = this.client.duplicate();
      this.subClient = this.client.duplicate();

      // Set up event listeners
      this._setupEventListeners();

      logger.info('Redis client initialized', {
        host: config.redis.host || 'connection-string-provided',
        port: config.redis.port || 'connection-string-provided',
        db: config.redis.db,
        connectionId: this.connectionId,
      });

      this.isConnected = true;
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to initialize Redis client', {
        error: error.message,
        stack: error.stack,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  _getRetryStrategy() {
    return (times) => {
      if (times > 10) {
        logger.error('Max Redis reconnection attempts reached', {
          connectionId: this.connectionId,
          times,
        });
        return null; // Stop retrying after 10 attempts
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 5000ms, 5000ms, ...
      const delay = Math.min(100 * Math.pow(2, times - 1), 5000);
      
      logger.warn(`Redis reconnecting attempt ${times} in ${delay}ms`, {
        connectionId: this.connectionId,
      });
      
      return delay;
    };
  }

  _setupEventListeners() {
    // Connection events
    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis client connected', {
        connectionId: this.connectionId,
      });
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready', {
        connectionId: this.connectionId,
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis client error', {
        error: error.message,
        stack: error.stack,
        connectionId: this.connectionId,
      });
    });

    this.client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting', {
        connectionId: this.connectionId,
      });
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.warn('Redis client connection closed', {
        connectionId: this.connectionId,
      });
    });
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error', {
        key,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async set(key, value, ttlSeconds = null) {
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSeconds) {
        return await this.client.set(key, stringValue, 'EX', ttlSeconds);
      }
      return await this.client.set(key, stringValue);
    } catch (error) {
      logger.error('Redis SET error', {
        key,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', {
        key,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.error('Redis EXPIRE error', {
        key,
        seconds,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async ttl(key) {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL error', {
        key,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async keys(pattern) {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error', {
        pattern,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async publish(channel, message) {
    try {
      const stringMessage = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.pubClient.publish(channel, stringMessage);
    } catch (error) {
      logger.error('Redis PUBLISH error', {
        channel,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async subscribe(channel, callback) {
    try {
      await this.subClient.subscribe(channel);
      
      this.subClient.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            const parsedMessage = this._safeJsonParse(message);
            callback(parsedMessage);
          } catch (error) {
            logger.error('Error parsing Redis message', {
              channel,
              message,
              error: error.message,
              connectionId: this.connectionId,
            });
          }
        }
      });
      
      return () => this.unsubscribe(channel);
    } catch (error) {
      logger.error('Redis SUBSCRIBE error', {
        channel,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async unsubscribe(channel) {
    try {
      return await this.subClient.unsubscribe(channel);
    } catch (error) {
      logger.error('Redis UNSUBSCRIBE error', {
        channel,
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async flushAll() {
    try {
      return await this.client.flushall();
    } catch (error) {
      logger.error('Redis FLUSHALL error', {
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async quit() {
    try {
      await Promise.all([
        this.client.quit(),
        this.pubClient.quit(),
        this.subClient.quit(),
      ]);
      this.isConnected = false;
      logger.info('Redis client disconnected', {
        connectionId: this.connectionId,
      });
    } catch (error) {
      logger.error('Error disconnecting Redis client', {
        error: error.message,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  _safeJsonParse(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return jsonString; // Return as is if not valid JSON
    }
  }
}

// Create a singleton instance
const redisClient = new RedisClient();

// Handle process termination
const shutdown = async () => {
  try {
    logger.info('Shutting down Redis client...');
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Error during Redis client shutdown', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = redisClient;
