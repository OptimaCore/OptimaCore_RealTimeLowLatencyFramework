#!/usr/bin/env node
const { Pool } = require('pg');
const { performance } = require('perf_hooks');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'optima',
  password: process.env.PGPASSWORD || 'postgres',
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 20, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
  query_timeout: 10000, // Query timeout in ms
  statement_timeout: 10000, // Statement timeout in ms
};

// Initialize pool
const pool = new Pool(config);

// Test queries
const testQueries = {
  simpleSelect: 'SELECT 1 as test',
  selectWithJoin: `
    SELECT u.*, p.* 
    FROM users u
    JOIN user_profiles p ON u.id = p.user_id
    WHERE u.status = 'active'
    LIMIT 100
  `,
  complexQuery: `
    WITH user_metrics AS (
      SELECT 
        user_id,
        COUNT(DISTINCT order_id) as order_count,
        SUM(amount) as total_spent
      FROM orders
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY user_id
    )
    SELECT 
      u.id,
      u.email,
      COALESCE(um.order_count, 0) as order_count,
      COALESCE(um.total_spent, 0) as total_spent
    FROM users u
    LEFT JOIN user_metrics um ON u.id = um.user_id
    WHERE u.status = 'active'
    ORDER BY um.total_spent DESC NULLS LAST
    LIMIT 100
  `,
  insertOperation: `
    INSERT INTO audit_log (user_id, action, details)
    VALUES ($1, $2, $3)
    RETURNING id, created_at
  `,
};

// Metrics collection
const metrics = {
  startTime: null,
  endTime: null,
  queryStats: {},
  poolStats: {
    total: 0,
    idle: 0,
    waiting: 0,
    max: config.max,
  },
  errors: [],
};

// Initialize metrics for each query type
Object.keys(testQueries).forEach(queryType => {
  metrics.queryStats[queryType] = {
    count: 0,
    durations: [],
    errors: 0,
    min: Infinity,
    max: 0,
    sum: 0,
  };
});

// Update pool statistics
function updatePoolStats() {
  metrics.poolStats = {
    ...metrics.poolStats,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
  return metrics.poolStats;
}

// Calculate percentiles
function calculatePercentiles(durations, percentiles = [0.5, 0.75, 0.9, 0.95, 0.99]) {
  if (!durations.length) return {};
  
  const sorted = [...durations].sort((a, b) => a - b);
  const results = {};
  
  percentiles.forEach(p => {
    const index = Math.ceil(p * sorted.length) - 1;
    results[`p${p * 100}`] = index >= 0 ? sorted[index] : 0;
  });
  
  return results;
}

// Run a single query test
async function runQueryTest(queryType, params = []) {
  const start = performance.now();
  const client = await pool.connect();
  
  try {
    const result = await client.query({
      text: testQueries[queryType],
      values: params,
      rowMode: 'array',
    });
    
    const duration = performance.now() - start;
    const stats = metrics.queryStats[queryType];
    
    stats.count++;
    stats.durations.push(duration);
    stats.sum += duration;
    stats.min = Math.min(stats.min, duration);
    stats.max = Math.max(stats.max, duration);
    
    updatePoolStats();
    return { success: true, duration, rowCount: result.rowCount };
  } catch (error) {
    const duration = performance.now() - start;
    metrics.queryStats[queryType].errors++;
    metrics.errors.push({
      queryType,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    
    updatePoolStats();
    return { success: false, duration, error: error.message };
  } finally {
    client.release();
  }
}

// Run a test scenario
async function runTestScenario(iterations = 100, concurrency = 10) {
  const queryTypes = Object.keys(testQueries);
  const testStartTime = Date.now();
  
  metrics.startTime = new Date(testStartTime).toISOString();
  console.log(`Starting test with ${iterations} iterations and ${concurrency} concurrent clients...`);
  
  const testPromises = [];
  
  for (let i = 0; i < iterations; i++) {
    const queryType = queryTypes[i % queryTypes.length];
    const params = [];
    
    // Generate test data for insert operations
    if (queryType === 'insertOperation') {
      params.push(
        Math.floor(Math.random() * 1000) + 1, // user_id
        `test_action_${i % 5}`, // action
        JSON.stringify({ test: true, iteration: i }) // details
      );
    }
    
    testPromises.push(runQueryTest(queryType, params));
    
    // Control concurrency
    if (testPromises.length >= concurrency) {
      await Promise.all(testPromises);
      testPromises.length = 0;
      
      // Log progress
      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${iterations} (${Math.round(((i + 1) / iterations) * 100)}%)`);
      }
    }
  }
  
  // Wait for remaining tests to complete
  await Promise.all(testPromises);
  
  metrics.endTime = new Date().toISOString();
  
  // Calculate final statistics
  Object.keys(metrics.queryStats).forEach(queryType => {
    const stats = metrics.queryStats[queryType];
    stats.avg = stats.count > 0 ? stats.sum / stats.count : 0;
    stats.percentiles = calculatePercentiles(stats.durations);
    
    // Clean up large arrays we don't need anymore
    delete stats.durations;
  });
  
  // Add test summary
  metrics.summary = {
    totalQueries: Object.values(metrics.queryStats).reduce((sum, stat) => sum + stat.count, 0),
    totalErrors: metrics.errors.length,
    testDuration: (Date.now() - testStartTime) / 1000,
    queriesPerSecond: 0,
  };
  
  if (metrics.summary.testDuration > 0) {
    metrics.summary.queriesPerSecond = 
      metrics.summary.totalQueries / metrics.summary.testDuration;
  }
  
  return metrics;
}

// Save results to file
function saveResults(filename = `db-metrics-${Date.now()}.json`) {
  const outputDir = path.join(process.cwd(), 'results');
  const outputPath = path.join(outputDir, filename);
  
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
    console.log(`Results saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Failed to save results:', error);
    return null;
  }
}

// Print summary to console
function printSummary() {
  console.log('\n=== Test Summary ===');
  console.log(`Duration: ${metrics.summary.testDuration.toFixed(2)}s`);
  console.log(`Total Queries: ${metrics.summary.totalQueries}`);
  console.log(`Queries/s: ${metrics.summary.queriesPerSecond.toFixed(2)}`);
  console.log(`Total Errors: ${metrics.summary.totalErrors}`);
  
  console.log('\n=== Pool Statistics ===');
  console.log(`Max Pool Size: ${metrics.poolStats.max}`);
  console.log(`Peak Connections: ${metrics.poolStats.total}`);
  console.log(`Peak Waiting: ${metrics.poolStats.waiting}`);
  
  console.log('\n=== Query Statistics ===');
  Object.entries(metrics.queryStats).forEach(([queryType, stats]) => {
    console.log(`\nQuery: ${queryType}`);
    console.log(`  Count: ${stats.count}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Min: ${stats.min.toFixed(2)}ms`);
    console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
    console.log(`  Max: ${stats.max.toFixed(2)}ms`);
    
    if (stats.percentiles) {
      console.log('  Percentiles (ms):');
      Object.entries(stats.percentiles).forEach(([p, value]) => {
        console.log(`    ${p}: ${value.toFixed(2)}`);
      });
    }
  });
  
  if (metrics.errors.length > 0) {
    console.log('\n=== Errors ===');
    metrics.errors.slice(0, 5).forEach((error, i) => {
      console.log(`${i + 1}. ${error.queryType}: ${error.error}`);
    });
    
    if (metrics.errors.length > 5) {
      console.log(`... and ${metrics.errors.length - 5} more errors`);
    }
  }
}

// Command line interface
program
  .name('db-test')
  .description('Run database performance tests')
  .option('-i, --iterations <number>', 'Number of test iterations', '100')
  .option('-c, --concurrency <number>', 'Number of concurrent clients', '10')
  .option('-o, --output <filename>', 'Output filename', 'db-metrics.json')
  .option('--no-save', 'Do not save results to file')
  .parse(process.argv);

// Main function
async function main() {
  const options = program.opts();
  
  try {
    // Test database connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    console.log('Database connection successful');
    
    // Run tests
    await runTestScenario(
      parseInt(options.iterations, 10),
      parseInt(options.concurrency, 10)
    );
    
    // Print and save results
    printSummary();
    
    if (options.save !== false) {
      const outputPath = saveResults(options.output);
      if (outputPath) {
        console.log(`Results saved to: ${outputPath}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the main function
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  runQueryTest,
  runTestScenario,
  calculatePercentiles,
  updatePoolStats,
  metrics,
};
