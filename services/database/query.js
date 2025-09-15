const dbPool = require('./pool');
const { promisify } = require('util');
const logger = require('../logger');

class QueryExecutor {
  constructor() {
    this.pool = dbPool;
    this.logger = logger.child({ module: 'database:query' });
  }

  /**
   * Execute a read query (can be routed to read replicas)
   * @param {string} text - SQL query string
   * @param {Array} params - Query parameters
   * @param {Object} [options] - Query options
   * @param {boolean} [options.usePrimary=false] - Force using primary database
   * @param {string} [options.queryName] - Name for logging and metrics
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = [], options = {}) {
    const { usePrimary = false, queryName } = options;
    const startTime = Date.now();
    const queryId = Math.random().toString(36).substring(2, 10);
    const logContext = {
      queryId,
      query: queryName || this._getQueryName(text),
      params: this._sanitizeParams(params),
      usePrimary
    };

    try {
      this.logger.debug(logContext, 'Executing database query');
      
      // Use primary for writes or when explicitly requested
      const result = usePrimary
        ? await this.pool.writeQuery(text, params)
        : await this.pool.readQuery(text, params);

      const duration = Date.now() - startTime;
      
      this.logger.debug({
        ...logContext,
        rowCount: result?.rowCount,
        durationMs: duration
      }, 'Query completed successfully');

      return result;
    } catch (error) {
      const errorContext = {
        ...logContext,
        error: error.message,
        stack: error.stack,
        code: error.code,
        durationMs: Date.now() - startTime
      };
      
      this.logger.error(errorContext, 'Database query failed');
      
      // Enhance error with context
      error.queryId = queryId;
      error.queryText = text;
      error.queryParams = params;
      
      throw error;
    }
  }

  /**
   * Execute a transaction
   * @param {Function} callback - Async function that receives a client and performs queries
   * @returns {Promise<*>} The result of the callback
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    const queryClient = {
      query: (text, params) => client.query(text, params),
      release: (err) => client.release(err)
    };

    try {
      await client.query('BEGIN');
      const result = await callback(queryClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error({ error: error.message, stack: error.stack }, 'Transaction failed');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Array<{text: string, params: Array}>} queries - Array of query objects
   * @returns {Promise<Array>} Array of query results
   */
  async batch(queries) {
    return this.transaction(async (client) => {
      const results = [];
      for (const query of queries) {
        const result = await client.query(query.text, query.params || []);
        results.push(result);
      }
      return results;
    });
  }

  /**
   * Get a single row from the database
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} First row or null if no results
   */
  async getOne(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  /**
   * Get all rows from a query
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Array of rows
   */
  async getAll(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }

  /**
   * Insert a row and return the inserted row
   * @param {string} table - Table name
   * @param {Object} data - Column-value pairs
   * @param {string} [returning='*'] - Columns to return
   * @returns {Promise<Object>} Inserted row
   */
  async insert(table, data, returning = '*') {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.map(k => `"${k}"`).join(', ');
    
    const text = `
      INSERT INTO "${table}" (${columns})
      VALUES (${placeholders})
      RETURNING ${returning}
    `;
    
    const result = await this.query(text, values, { usePrimary: true });
    return result.rows[0];
  }

  /**
   * Update rows and return the updated rows
   * @param {string} table - Table name
   * @param {Object} data - Column-value pairs to update
   * @param {Object} where - Conditions for the WHERE clause
   * @param {string} [returning='*'] - Columns to return
   * @returns {Promise<Array>} Updated rows
   */
  async update(table, data, where, returning = '*') {
    const setClause = Object.keys(data)
      .map((key, i) => `"${key}" = $${i + 1}`)
      .join(', ');
    
    const whereClause = Object.keys(where)
      .map((key, i) => `"${key}" = $${i + Object.keys(data).length + 1}`)
      .join(' AND ');
    
    const values = [...Object.values(data), ...Object.values(where)];
    
    const text = `
      UPDATE "${table}"
      SET ${setClause}
      WHERE ${whereClause}
      RETURNING ${returning}
    `;
    
    const result = await this.query(text, values, { usePrimary: true });
    return result.rows;
  }

  /**
   * Delete rows and return the deleted rows
   * @param {string} table - Table name
   * @param {Object} where - Conditions for the WHERE clause
   * @param {string} [returning='*'] - Columns to return
   * @returns {Promise<Array>} Deleted rows
   */
  async delete(table, where, returning = '*') {
    const whereClause = Object.keys(where)
      .map((key, i) => `"${key}" = $${i + 1}`)
      .join(' AND ');
    
    const values = Object.values(where);
    
    const text = `
      DELETE FROM "${table}"
      WHERE ${whereClause}
      RETURNING ${returning}
    `;
    
    const result = await this.query(text, values, { usePrimary: true });
    return result.rows;
  }

  /**
   * Sanitize parameters for logging
   * @private
   */
  _sanitizeParams(params) {
    if (!params || !Array.isArray(params)) return [];
    return params.map(p => {
      if (Buffer.isBuffer(p)) return '<Buffer>';
      if (p instanceof Date) return p.toISOString();
      if (typeof p === 'object') return JSON.stringify(p);
      return p;
    });
  }

  /**
   * Extract a simple query name for logging
   * @private
   */
  _getQueryName(sql) {
    if (!sql) return 'unknown';
    const match = sql.trim().match(/^\s*(\w+)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}

// Export a singleton instance
module.exports = new QueryExecutor();
