#!/usr/bin/env node

/**
 * Latency Benchmark for OptimaCore
 * 
 * Runs A/B/C variants with different storage backends and measures performance.
 * Tracks storage_source and cache_hit metrics for each request.
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Initialize command line interface
const program = new Command();
program
  .name('latency-test')
  .description('Run latency benchmarks across different storage backends')
  .version('1.0.0')
  .requiredOption('-v, --variant <type>', 'Variant to test (hierarchical|distributed|hybrid)')
  .option('-o, --out <file>', 'Output file for results', 'results/benchmark.json')
  .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
  .option('-n, --requests <number>', 'Number of requests per test', '100')
  .option('--base-url <url>', 'Base URL of the API', 'http://localhost:3001')
  .parse(process.argv);

const options = program.opts();

// Storage variants configuration
const VARIANTS = {
  hierarchical: {
    name: 'Hierarchical',
    params: { storage: 'redis', cache: true },
  },
  distributed: {
    name: 'Distributed',
    params: { storage: 'cosmos', cache: true },
  },
  hybrid: {
    name: 'Hybrid',
    params: { storage: 'postgres', cache: true },
  },
};

// Test data
const TEST_DATA = {
  userId: 'test-user-1',
  payload: {
    timestamp: new Date().toISOString(),
    data: 'benchmark-test-data',
  },
};

// Results storage
const results = {
  metadata: {
    testId: uuidv4(),
    startTime: new Date().toISOString(),
    variant: options.variant,
    concurrency: parseInt(options.concurrency),
    totalRequests: parseInt(options.requests),
  },
  requests: [],
  summary: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalDuration: 0,
    storageSources: {},
    cacheHitRate: 0,
    latency: {
      min: Number.MAX_SAFE_INTEGER,
      max: 0,
      avg: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
    },
  },
};

// HTTP client with keep-alive
const http = axios.create({
  baseURL: options.baseUrl,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  maxRedirects: 0,
  validateStatus: () => true, // Don't throw on HTTP errors
});

/**
 * Make a test request and track metrics
 */
async function makeRequest() {
  const requestId = uuidv4();
  const startTime = performance.now();
  
  try {
    const response = await http.post('/api/benchmark', {
      ...TEST_DATA,
      variant: options.variant,
      requestId,
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    const storageSource = response.headers['x-storage-source'] || 'unknown';
    const cacheHit = response.headers['x-cache-hit'] === 'true';
    
    const result = {
      requestId,
      timestamp: new Date().toISOString(),
      status: response.status,
      duration,
      storageSource,
      cacheHit,
      success: response.status >= 200 && response.status < 300,
    };
    
    return result;
  } catch (error) {
    const endTime = performance.now();
    return {
      requestId,
      timestamp: new Date().toISOString(),
      status: error.response?.status || 0,
      duration: endTime - startTime,
      storageSource: 'error',
      cacheHit: false,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Save results to file
 */
function saveResults() {
  try {
    const outputDir = path.dirname(options.out);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      options.out,
      JSON.stringify(results, null, 2),
      'utf8'
    );
    
    console.log(`✅ Results saved to ${path.resolve(options.out)}`);
  } catch (error) {
    console.error('❌ Failed to save results:', error);
  }
}

/**
 * Calculate statistics from results
 */
function calculateStats() {
  const latencies = results.requests
    .filter(r => r.success)
    .map(r => r.duration);
    
  if (latencies.length === 0) return;
  
  // Sort latencies for percentile calculation
  latencies.sort((a, b) => a - b);
  
  // Calculate percentiles
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p90 = latencies[Math.floor(latencies.length * 0.9)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  
  // Count storage sources and cache hits
  const storageSources = {};
  let cacheHits = 0;
  
  results.requests.forEach(req => {
    if (req.success) {
      storageSources[req.storageSource] = (storageSources[req.storageSource] || 0) + 1;
      if (req.cacheHit) cacheHits++;
    }
  });
  
  // Update summary
  results.summary = {
    totalRequests: results.requests.length,
    successfulRequests: latencies.length,
    failedRequests: results.requests.length - latencies.length,
    totalDuration: results.requests.reduce((sum, req) => sum + req.duration, 0),
    storageSources,
    cacheHitRate: latencies.length > 0 ? (cacheHits / latencies.length) * 100 : 0,
    latency: {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50,
      p90,
      p95,
      p99,
    },
  };
}

/**
 * Print summary to console
 */
function printSummary() {
  const { summary } = results;
  
  console.log('\n📊 Benchmark Results');
  console.log('==================');
  console.log(`Variant:       ${options.variant}`);
  console.log(`Total Reqs:    ${summary.totalRequests}`);
  console.log(`Successful:    ${summary.successfulRequests} (${((summary.successfulRequests / summary.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`Failed:        ${summary.failedRequests} (${((summary.failedRequests / summary.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`Cache Hit:     ${summary.cacheHitRate.toFixed(1)}%`);
  
  console.log('\n⏱  Latency (ms)');
  console.log('------------------');
  console.log(`Avg: ${summary.latency.avg.toFixed(2)}`);
  console.log(`Min: ${summary.latency.min.toFixed(2)}`);
  console.log(`Max: ${summary.latency.max.toFixed(2)}`);
  console.log(`p50: ${summary.latency.p50.toFixed(2)}`);
  console.log(`p90: ${summary.latency.p90.toFixed(2)}`);
  console.log(`p95: ${summary.latency.p95.toFixed(2)}`);
  console.log(`p99: ${summary.latency.p99.toFixed(2)}`);
  
  console.log('\n💾 Storage Sources');
  console.log('------------------');
  Object.entries(summary.storageSources).forEach(([source, count]) => {
    console.log(`${source}: ${count} (${((count / summary.successfulRequests) * 100).toFixed(1)}%)`);
  });
}

/**
 * Run the benchmark
 */
async function runBenchmark() {
  console.log(`🚀 Starting benchmark for variant: ${options.variant}`);
  console.log(`🔗 Base URL: ${options.baseUrl}`);
  console.log(`🔁 Concurrency: ${options.concurrency}`);
  console.log(`📊 Requests: ${options.requests}`);
  console.log('\nRunning benchmark...');
  
  const variant = VARIANTS[options.variant];
  if (!variant) {
    console.error(`❌ Invalid variant: ${options.variant}. Must be one of: ${Object.keys(VARIANTS).join(', ')}`);
    process.exit(1);
  }
  
  // Create batches of requests
  const totalRequests = parseInt(options.requests);
  const concurrency = parseInt(options.concurrency);
  const batches = [];
  
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batchSize = Math.min(concurrency, totalRequests - i);
    const batch = Array(batchSize).fill().map(() => makeRequest());
    batches.push(batch);
    
    // Add a small delay between batches
    if (i + concurrency < totalRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Process batches sequentially
  for (const batch of batches) {
    const batchResults = await Promise.all(batch);
    results.requests.push(...batchResults);
    
    // Show progress
    const progress = (results.requests.length / totalRequests * 100).toFixed(1);
    process.stdout.write(`\rProgress: ${progress}% (${results.requests.length}/${totalRequests})`);
  }
  
  // Final calculations
  calculateStats();
  saveResults();
  printSummary();
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n🛑 Benchmark interrupted. Saving partial results...');
  calculateStats();
  saveResults();
  printSummary();
  process.exit(0);
});

// Run the benchmark
runBenchmark().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
