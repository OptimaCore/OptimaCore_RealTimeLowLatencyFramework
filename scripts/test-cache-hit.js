#!/usr/bin/env node

const RedisClient = require('../services/redis/client');
const metrics = require('../services/redis/metrics');
const { program } = require('commander');
const chalk = require('chalk');
const { table } = require('table');

// Command line options
program
  .option('--pattern <type>', 'Test pattern: hit-miss, read-through, write-through, or all', 'all')
  .option('--iterations <number>', 'Number of test iterations', '1000')
  .option('--host <host>', 'Redis host')
  .option('--port <port>', 'Redis port')
  .option('--password <password>', 'Redis password')
  .option('--db <number>', 'Redis database number', '0')
  .parse(process.argv);

const options = program.opts();

// Test data
const TEST_DATA = {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ],
  products: [
    { id: 'p1', name: 'Laptop', price: 999.99 },
    { id: 'p2', name: 'Smartphone', price: 699.99 },
    { id: 'p3', name: 'Tablet', price: 399.99 },
  ],
};

// Simulate a database or slow storage
class MockDatabase {
  constructor() {
    this.storage = new Map();
    
    // Initialize with test data
    this.storage.set('user:1', JSON.stringify(TEST_DATA.users[0]));
    this.storage.set('user:2', JSON.stringify(TEST_DATA.users[1]));
    this.storage.set('user:3', JSON.stringify(TEST_DATA.users[2]));
    this.storage.set('product:p1', JSON.stringify(TEST_DATA.products[0]));
    this.storage.set('product:p2', JSON.stringify(TEST_DATA.products[1]));
    this.storage.set('product:p3', JSON.stringify(TEST_DATA.products[2]));
  }

  async get(key) {
    // Simulate network/database latency
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.storage.get(key) ? JSON.parse(this.storage.get(key)) : null;
  }

  async set(key, value) {
    // Simulate network/database latency
    await new Promise(resolve => setTimeout(resolve, 15));
    this.storage.set(key, JSON.stringify(value));
    return true;
  }
}

// Create a mock database
const mockDb = new MockDatabase();

// Initialize Redis client with configuration from command line or defaults
const redisConfig = {
  host: options.host || 'localhost',
  port: options.port || 6379,
  password: options.password || '',
  db: parseInt(options.db, 10) || 0,
  keyPrefix: 'test:',
  cacheOptions: {
    defaultTtl: 60, // 1 minute
  }
};

// Helper function to print metrics
function printMetrics(title, stats) {
  console.log(`\n${chalk.bold.underline(title)}`);
  
  const data = [
    [
      chalk.bold('Metric'), 
      chalk.bold('Value'),
      chalk.bold('Description')
    ],
    [
      'Cache Hits',
      stats.cache_hit,
      'Number of successful cache reads'
    ],
    [
      'Cache Misses',
      stats.cache_miss,
      'Number of cache read misses'
    ],
    [
      'Hit Ratio',
      `${stats.hit_ratio}%`,
      'Cache hit ratio (hits / (hits + misses))'
    ],
    [
      'Cache Sets',
      stats.cache_set,
      'Number of cache write operations'
    ],
    [
      'Cache Deletes',
      stats.cache_del,
      'Number of cache delete operations'
    ],
    [
      'Command Duration (avg)',
      `${stats.command_duration.avg.toFixed(2)}ms`,
      'Average command execution time'
    ],
    [
      'Command Duration (min)',
      `${stats.command_duration.min.toFixed(2)}ms`,
      'Minimum command execution time'
    ],
    [
      'Command Duration (max)',
      `${stats.command_duration.max.toFixed(2)}ms`,
      'Maximum command execution time'
    ],
  ];
  
  const config = {
    columns: [
      { alignment: 'left', width: 25 },
      { alignment: 'right', width: 15 },
      { alignment: 'left', width: 50 }
    ],
    header: {
      content: title,
      alignment: 'center'
    }
  };
  
  console.log(table(data, config));
}

// Test 1: Basic cache hit/miss pattern
async function testCacheHitMiss(iterations) {
  console.log(chalk.blue.bold('\n=== Testing Cache Hit/Miss Pattern ==='));
  
  const client = new RedisClient({
    ...redisConfig,
    strategy: RedisClient.STRATEGY.CACHE_ASIDE
  });
  
  try {
    const key = 'test:cache:hitmiss';
    const value = { data: 'test', timestamp: Date.now() };
    
    // Initial set
    await client.set(key, value);
    
    // Test cache hits
    const hitStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await client.get(key);
    }
    const hitDuration = Date.now() - hitStart;
    
    // Test cache miss
    await client.del(key);
    const missStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await client.get(key);
    }
    const missDuration = Date.now() - missStart;
    
    const stats = metrics.getMetrics();
    
    console.log(chalk.green(`\nCache Hit Test (${iterations} iterations):`));
    console.log(`  - Hit Duration: ${hitDuration}ms (${(hitDuration / iterations).toFixed(2)}ms/op)`);
    console.log(`  - Miss Duration: ${missDuration}ms (${(missDuration / iterations).toFixed(2)}ms/op)`);
    
    printMetrics('Cache Hit/Miss Metrics', stats);
    
    return stats;
  } finally {
    await client.close();
    metrics.reset();
  }
}

// Test 2: Read-through caching
async function testReadThrough(iterations) {
  console.log(chalk.blue.bold('\n=== Testing Read-Through Caching ==='));
  
  // Simulate a slow database loader
  const loader = async (key) => {
    // Simulate database load time
    await new Promise(resolve => setTimeout(resolve, 20));
    return mockDb.get(key);
  };
  
  const client = new RedisClient({
    ...redisConfig,
    strategy: RedisClient.STRATEGY.READ_THROUGH,
    loader
  });
  
  try {
    const key = 'user:1';
    
    // Clear cache first
    await client.del(key);
    
    // First access should be a miss and load from DB
    console.log(chalk.yellow('First access (should be a miss):'));
    const firstStart = Date.now();
    const firstResult = await client.get(key);
    const firstDuration = Date.now() - firstStart;
    console.log(`  - Result: ${JSON.stringify(firstResult)}`);
    console.log(`  - Duration: ${firstDuration}ms`);
    
    // Second access should be a hit from cache
    console.log(chalk.yellow('\nSecond access (should be a hit):'));
    const secondStart = Date.now();
    const secondResult = await client.get(key);
    const secondDuration = Date.now() - secondStart;
    console.log(`  - Result: ${JSON.stringify(secondResult)}`);
    console.log(`  - Duration: ${secondDuration}ms`);
    
    // Verify that the second access was much faster
    if (firstDuration <= secondDuration) {
      console.warn(chalk.yellow('Warning: Cache hit was not faster than cache miss!'));
    }
    
    // Test with multiple keys
    const keys = ['user:1', 'user:2', 'user:3', 'user:4'];
    console.log(chalk.yellow('\nTesting with multiple keys:'));
    
    const multiStart = Date.now();
    const results = await Promise.all(keys.map(k => client.get(k)));
    const multiDuration = Date.now() - multiStart;
    
    console.log(`  - Fetched ${results.filter(Boolean).length} of ${keys.length} items`);
    console.log(`  - Duration: ${multiDuration}ms`);
    
    const stats = metrics.getMetrics();
    printMetrics('Read-Through Cache Metrics', stats);
    
    return stats;
  } finally {
    await client.close();
    metrics.reset();
  }
}

// Test 3: Write-through caching
async function testWriteThrough(iterations) {
  console.log(chalk.blue.bold('\n=== Testing Write-Through Caching ==='));
  
  // Track writes to the database
  const writeLog = [];
  
  // Simulate a database writer
  const writer = async (key, value) => {
    // Simulate database write time
    await new Promise(resolve => setTimeout(resolve, 15));
    writeLog.push({ key, value, timestamp: new Date().toISOString() });
    return true;
  };
  
  const client = new RedisClient({
    ...redisConfig,
    strategy: RedisClient.STRATEGY.WRITE_THROUGH,
    writer
  });
  
  try {
    const key = 'user:new';
    const newUser = {
      id: Date.now(),
      name: 'New User',
      email: `user-${Date.now()}@example.com`
    };
    
    // Write a new user
    console.log(chalk.yellow('Writing new user with write-through:'));
    const writeStart = Date.now();
    await client.set(key, newUser);
    const writeDuration = Date.now() - writeStart;
    
    console.log(`  - Wrote user: ${JSON.stringify(newUser)}`);
    console.log(`  - Write duration: ${writeDuration}ms`);
    
    // Verify the write was logged
    console.log(chalk.yellow('\nWrite log:'));
    console.log(`  - Writes recorded: ${writeLog.length}`);
    console.log(`  - Last write: ${JSON.stringify(writeLog[writeLog.length - 1])}`);
    
    // Read back the user
    console.log(chalk.yellow('\nReading back the user:'));
    const readStart = Date.now();
    const readUser = await client.get(key);
    const readDuration = Date.now() - readStart;
    
    console.log(`  - Read user: ${JSON.stringify(readUser)}`);
    console.log(`  - Read duration: ${readDuration}ms`);
    
    // Verify the user was written to cache
    if (JSON.stringify(readUser) !== JSON.stringify(newUser)) {
      console.error(chalk.red('Error: Read user does not match written user!'));
    }
    
    const stats = metrics.getMetrics();
    printMetrics('Write-Through Cache Metrics', stats);
    
    return stats;
  } finally {
    await client.close();
    metrics.reset();
  }
}

// Main function to run tests
async function runTests() {
  try {
    const iterations = parseInt(options.iterations, 10) || 1000;
    const pattern = options.pattern.toLowerCase();
    
    console.log(chalk.blue.bold('=== Redis Cache Tester ==='));
    console.log(`Pattern: ${pattern}, Iterations: ${iterations}`);
    
    const results = {};
    
    if (pattern === 'all' || pattern === 'hit-miss') {
      results.hitMiss = await testCacheHitMiss(iterations);
    }
    
    if (pattern === 'all' || pattern === 'read-through') {
      results.readThrough = await testReadThrough(iterations);
    }
    
    if (pattern === 'all' || pattern === 'write-through') {
      results.writeThrough = await testWriteThrough(iterations);
    }
    
    console.log(chalk.green.bold('\n=== All Tests Completed ==='));
    
    // Print summary
    if (results.hitMiss) {
      console.log(`\n${chalk.bold('Hit/Miss Test:')}`);
      console.log(`  - Hit Ratio: ${results.hitMiss.hit_ratio}%`);
      console.log(`  - Avg. Command Time: ${results.hitMiss.command_duration.avg.toFixed(2)}ms`);
    }
    
    if (results.readThrough) {
      console.log(`\n${chalk.bold('Read-Through Test:')}`);
      console.log(`  - Cache Hits: ${results.readThrough.cache_hit}`);
      console.log(`  - Cache Misses: ${results.readThrough.cache_miss}`);
    }
    
    if (results.writeThrough) {
      console.log(`\n${chalk.bold('Write-Through Test:')}`);
      console.log(`  - Cache Sets: ${results.writeThrough.cache_set}`);
      console.log(`  - Writes to DB: ${results.writeThrough.cache_set}`);
    }
    
  } catch (error) {
    console.error(chalk.red('\nError running tests:'), error);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
