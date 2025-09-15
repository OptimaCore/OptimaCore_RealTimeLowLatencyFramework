const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');

class RedisMetrics extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      cache_hit: 0,
      cache_miss: 0,
      cache_set: 0,
      cache_del: 0,
      cache_expire: 0,
      command_total: 0,
      command_errors: 0,
      command_duration: {
        sum: 0,
        count: 0,
        min: Number.MAX_SAFE_INTEGER,
        max: 0,
      },
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Record a cache hit
   */
  recordHit() {
    this.metrics.cache_hit++;
    this.metrics.command_total++;
    this.emit('metrics', { type: 'cache_hit' });
  }

  /**
   * Record a cache miss
   */
  recordMiss() {
    this.metrics.cache_miss++;
    this.metrics.command_total++;
    this.emit('metrics', { type: 'cache_miss' });
  }

  /**
   * Record a cache set operation
   * @param {string} key - The cache key
   * @param {number} ttl - Time to live in seconds
   */
  recordSet(key, ttl = 0) {
    this.metrics.cache_set++;
    this.metrics.command_total++;
    this.emit('metrics', { 
      type: 'cache_set', 
      key,
      ttl,
      timestamp: Date.now()
    });
  }

  /**
   * Record a cache delete operation
   * @param {string} key - The cache key
   */
  recordDel(key) {
    this.metrics.cache_del++;
    this.metrics.command_total++;
    this.emit('metrics', { 
      type: 'cache_del',
      key,
      timestamp: Date.now()
    });
  }

  /**
   * Record command execution time
   * @param {string} command - The Redis command
   * @param {number} startTime - Performance timestamp when the command started
   */
  recordCommandTime(command, startTime) {
    const duration = performance.now() - startTime;
    const durationMs = Math.round(duration * 100) / 100; // Round to 2 decimal places
    
    // Update command duration stats
    this.metrics.command_duration.sum += durationMs;
    this.metrics.command_duration.count++;
    this.metrics.command_duration.min = Math.min(this.metrics.command_duration.min, durationMs);
    this.metrics.command_duration.max = Math.max(this.metrics.command_duration.max, durationMs);
    
    this.metrics.last_updated = new Date().toISOString();
    
    this.emit('command', { 
      command, 
      duration: durationMs,
      timestamp: Date.now()
    });
    
    return durationMs;
  }

  /**
   * Record a command error
   * @param {string} command - The Redis command that failed
   * @param {Error} error - The error that occurred
   */
  recordError(command, error) {
    this.metrics.command_errors++;
    this.metrics.last_updated = new Date().toISOString();
    
    this.emit('error', { 
      command, 
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
  }

  /**
   * Get all metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      command_duration: {
        ...this.metrics.command_duration,
        avg: this.metrics.command_duration.count > 0 
          ? Math.round((this.metrics.command_duration.sum / this.metrics.command_duration.count) * 100) / 100 
          : 0,
      },
      hit_ratio: this.metrics.command_total > 0 
        ? Math.round((this.metrics.cache_hit / (this.metrics.cache_hit + this.metrics.cache_miss)) * 10000) / 100 
        : 0,
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      cache_hit: 0,
      cache_miss: 0,
      cache_set: 0,
      cache_del: 0,
      cache_expire: 0,
      command_total: 0,
      command_errors: 0,
      command_duration: {
        sum: 0,
        count: 0,
        min: Number.MAX_SAFE_INTEGER,
        max: 0,
      },
      last_updated: new Date().toISOString(),
    };
  }
}

// Export a singleton instance
const metrics = new RedisMetrics();
module.exports = metrics;
