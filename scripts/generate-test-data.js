#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
// Simple normal distribution random number generator
function normal(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + stdDev * normal;
}

// Configuration
const NUM_SAMPLES = 100;
const STORAGE_SOURCES = ['local', 's3', 'gcs', 'azure-blob'];
const METRICS = ['latency_ms', 'throughput_rps', 'error_rate'];
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'test_results');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate random data with normal distribution
function generateRandomData(mean, stdDev, min = 0, max = Infinity) {
  return Array.from({ length: NUM_SAMPLES }, () => {
    let value;
    do {
      value = normal(mean, stdDev);
    } while (value < min || value > max);
    return Number(value.toFixed(2));
  });
}

// Generate test data for each storage source
async function generateTestData() {
  const testData = [];
  const timestamp = new Date().toISOString();
  
  for (const source of STORAGE_SOURCES) {
    // Generate different distributions for each storage source
    const latencyMean = {
      'local': 45,
      's3': 65,
      'gcs': 55,
      'azure-blob': 60
    }[source];
    
    const throughputMean = {
      'local': 1200,
      's3': 1000,
      'gcs': 1100,
      'azure-blob': 1050
    }[source];
    
    const errorMean = {
      'local': 0.012,
      's3': 0.008,
      'gcs': 0.009,
      'azure-blob': 0.010
    }[source];
    
    // Generate random values for each metric
    const latencies = generateRandomData(latencyMean, latencyMean * 0.15, 10, 200);
    const throughputs = generateRandomData(throughputMean, throughputMean * 0.1, 500, 2000);
    const errorRates = generateRandomData(errorMean, errorMean * 0.3, 0, 0.05);
    
    // Create records
    for (let i = 0; i < NUM_SAMPLES; i++) {
      testData.push({
        experiment_id: `latency_test_${source}`,
        run_id: uuidv4(),
        timestamp: new Date(Date.parse(timestamp) + i * 1000).toISOString(),
        metrics: {
          latency_ms: latencies[i],
          throughput_rps: Math.round(throughputs[i]),
          error_rate: errorRates[i],
          cpu_usage: 70 + Math.random() * 20,
          memory_usage_mb: 800 + Math.random() * 500
        },
        parameters: {
          concurrent_users: 100,
          test_duration_seconds: 300,
          target_endpoint: "api/v1/process",
          payload_size_kb: 2.5,
          use_compression: Math.random() > 0.5,
          cache_enabled: Math.random() > 0.7
        },
        metadata: {
          hostname: `test-${source}-${i % 5}`,
          cpu_count: 8,
          memory_mb: 16384,
          os: "linux",
          tags: ["performance", "load_test", "api_v1"]
        },
        storage_source: source,
        cache_hit: Math.random() > 0.8,
        duration_ms: 300000 + Math.floor(Math.random() * 10000) - 5000,
        version: "1.0.0"
      });
    }
  }
  
  // Shuffle the data
  for (let i = testData.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [testData[i], testData[j]] = [testData[j], testData[i]];
  }
  
  // Save to file
  const outputFile = path.join(OUTPUT_DIR, `test_data_${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(testData, null, 2));
  
  console.log(`Generated ${testData.length} test records in ${outputFile}`);
  return outputFile;
}

// Run the generator
generateTestData().catch(console.error);
