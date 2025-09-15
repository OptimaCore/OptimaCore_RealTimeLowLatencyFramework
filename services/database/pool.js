const { Pool } = require('pg');
const { promisify } = require('util');
const metrics = require('../metrics');
const config = require('../../config');

class DatabasePool {
  constructor() {
    this.primaryPool = this.createPool(config.database);
    this.replicaPools = [];
    
    // Initialize replica pools if configured
    if (config.database.replicas && Array.isArray(config.database.replicas)) {
      this.replicaPools = config.database.replicas.map(replicaConfig => 
        this.createPool({ ...config.database, ...replicaConfig, isReplica: true })
      );
    }
    
    // Add promisified methods
    this.query = promisify(this.primaryPool.query).bind(this.primaryPool);
    this.connect = promisify(this.primaryPool.connect).bind(this.primaryPool);
    this.end = promisify(this.primaryPool.end).bind(this.primaryPool);
    
    // Setup metrics collection
    this.setupMetrics();
  }
  
  createPool(poolConfig) {
    const pool = new Pool({
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
      password: poolConfig.password,
      database: poolConfig.database,
      max: poolConfig.maxConnections || 20,
      idleTimeoutMillis: poolConfig.idleTimeout || 30000,
      connectionTimeoutMillis: poolConfig.connectionTimeout || 2000,
      application_name: poolConfig.applicationName || 'optima-core-app',
      ssl: poolConfig.ssl ? {
        rejectUnauthorized: poolConfig.ssl.rejectUnauthorized !== false,
        ...(poolConfig.ssl.ca && { ca: poolConfig.ssl.ca })
      } : false
    });
    
    // Event listeners for pool metrics
    pool.on('connect', (client) => {
      metrics.increment('db.connections.total');
      metrics.gauge('db.connections.active', pool.totalCount - pool.idleCount);
    });
    
    pool.on('remove', () => {
      metrics.gauge('db.connections.active', pool.totalCount - pool.idleCount);
    });
    
    // Error handling
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      metrics.increment('db.errors', { error_type: 'pool' });
    });
    
    return pool;
  }
  
  setupMetrics() {
    // Track pool metrics
    setInterval(() => {
      metrics.gauge('db.pool.total', this.primaryPool.totalCount);
      metrics.gauge('db.pool.idle', this.primaryPool.idleCount);
      metrics.gauge('db.pool.waiting', this.primaryPool.waitingCount);
      
      // Track replica lag if replicas are configured
      this.replicaPools.forEach((pool, index) => {
        pool.query('SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) as lag_seconds')
          .then(res => {
            metrics.gauge('db.replica.lag_seconds', parseFloat(res.rows[0].lag_seconds || 0), { replica: index });
          })
          .catch(err => {
            console.error(`Error checking replica ${index} lag:`, err);
            metrics.increment('db.replica.errors', { replica: index });
          });
      });
    }, 10000); // Every 10 seconds
  }
  
  // Get a read replica pool in a round-robin fashion
  getReplicaPool() {
    if (this.replicaPools.length === 0) {
      return this.primaryPool; // Fallback to primary if no replicas
    }
    
    // Simple round-robin selection
    this.replicaIndex = ((this.replicaIndex || 0) + 1) % this.replicaPools.length;
    return this.replicaPools[this.replicaIndex];
  }
  
  // Execute a read query (can use read replicas)
  async readQuery(text, params = []) {
    const start = process.hrtime();
    const pool = this.getReplicaPool();
    
    try {
      const result = await pool.query(text, params);
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = (seconds * 1000) + (nanoseconds / 1e6);
      
      metrics.timing('db.query.duration', duration, { query: this.getQueryName(text), type: 'read' });
      metrics.increment('db.query.total', { type: 'read', status: 'success' });
      
      return result;
    } catch (error) {
      metrics.increment('db.query.total', { type: 'read', status: 'error' });
      metrics.increment('db.errors', { error_type: 'query', query: this.getQueryName(text) });
      throw error;
    }
  }
  
  // Execute a write query (always uses primary)
  async writeQuery(text, params = []) {
    const start = process.hrtime();
    
    try {
      const result = await this.primaryPool.query(text, params);
      const [seconds, nanoseconds] = process.hrtime(start);
      const duration = (seconds * 1000) + (nanoseconds / 1e6);
      
      metrics.timing('db.query.duration', duration, { query: this.getQueryName(text), type: 'write' });
      metrics.increment('db.query.total', { type: 'write', status: 'success' });
      
      return result;
    } catch (error) {
      metrics.increment('db.query.total', { type: 'write', status: 'error' });
      metrics.increment('db.errors', { error_type: 'query', query: this.getQueryName(text) });
      throw error;
    }
  }
  
  // Extract a simple query name for metrics
  getQueryName(sql) {
    // Get first word (SELECT, INSERT, etc.)
    const match = sql.trim().match(/^\s*(\w+)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
  
  // Close all database connections
  async close() {
    await Promise.all([
      this.primaryPool.end(),
      ...this.replicaPools.map(pool => pool.end())
    ]);
  }
}

// Create a singleton instance
const dbPool = new DatabasePool();

// Handle process termination
process.on('SIGTERM', async () => {
  await dbPool.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await dbPool.close();
  process.exit(0);
});

module.exports = dbPool;
