const { Pool } = require('pg');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/loader');
const logger = require('../../utils/logger').logger;

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.client = null;
    this.isConnected = false;
    this.connectionId = uuidv4();
    this.initialize();
  }

  initialize() {
    try {
      // Use connection string if provided, otherwise use individual parameters
      const connectionConfig = config.database.connectionString
        ? { connectionString: config.database.connectionString }
        : {
            host: config.database.host,
            port: config.database.port,
            user: config.database.user,
            password: config.database.password,
            database: config.database.name,
            ssl: config.database.ssl
              ? { rejectUnauthorized: false } // For self-signed certificates in development
              : false,
          };

      // Create a new pool
      this.pool = new Pool({
        ...connectionConfig,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
        connectionTimeoutMillis: 5000, // How long to wait when connecting a new client
        application_name: `${config.app.name}-${config.app.env}-${this.connectionId}`,
      });

      // Log pool events
      this.pool.on('connect', () => {
        logger.debug('New database connection established', {
          connectionId: this.connectionId,
        });
      });

      this.pool.on('error', (err) => {
        logger.error('Unexpected error on idle client', {
          error: err.message,
          stack: err.stack,
          connectionId: this.connectionId,
        });
      });

      this.isConnected = true;
      logger.info('Database connection pool initialized', {
        host: config.database.host,
        database: config.database.name,
        ssl: !!config.database.ssl,
        connectionId: this.connectionId,
      });
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to initialize database connection pool', {
        error: error.message,
        stack: error.stack,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async getClient() {
    try {
      if (!this.pool) {
        throw new Error('Connection pool is not initialized');
      }

      const client = await this.pool.connect();
      const clientId = uuidv4();

      // Set a timeout for queries
      const query = client.query;
      const release = client.release;

      // Set a timeout on this specific client
      const timeout = setTimeout(() => {
        logger.error('Database query timeout', {
          clientId,
          connectionId: this.connectionId,
        });
        release.call(client);
      }, 30000); // 30 seconds timeout

      // Override the query method to clear the timeout
      client.query = (...args) => {
        clearTimeout(timeout);
        return query.apply(client, args);
      };

      // Override the release method to clear the timeout
      client.release = () => {
        clearTimeout(timeout);
        client.query = query;
        client.release = release;
        return release.apply(client);
      };

      return client;
    } catch (error) {
      logger.error('Failed to get database client', {
        error: error.message,
        stack: error.stack,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }

  async query(text, params = []) {
    const start = Date.now();
    const queryId = uuidv4();

    try {
      const client = await this.getClient();
      
      try {
        logger.debug('Executing database query', {
          queryId,
          text,
          params: params.map(p => (typeof p === 'string' ? p.substring(0, 100) : p)),
          connectionId: this.connectionId,
        });

        const result = await client.query(text, params);
        const duration = Date.now() - start;

        logger.debug('Database query executed', {
          queryId,
          duration: `${duration}ms`,
          rowCount: result.rowCount,
          connectionId: this.connectionId,
        });

        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.error('Database query failed', {
        queryId,
        error: error.message,
        stack: error.stack,
        text,
        params: params.map(p => (typeof p === 'string' ? p.substring(0, 100) : p)),
        duration: `${duration}ms`,
        connectionId: this.connectionId,
      });
      
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        this.isConnected = false;
        logger.info('Database connection pool closed', {
          connectionId: this.connectionId,
        });
      }
    } catch (error) {
      logger.error('Error closing database connection pool', {
        error: error.message,
        stack: error.stack,
        connectionId: this.connectionId,
      });
      throw error;
    }
  }
}

// Create a singleton instance
const db = new DatabaseConnection();

// Handle process termination
const shutdown = async () => {
  try {
    logger.info('Shutting down database connection pool...');
    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Error during database shutdown', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = db;
