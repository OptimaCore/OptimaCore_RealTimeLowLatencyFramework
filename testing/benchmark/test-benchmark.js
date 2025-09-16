#!/usr/bin/env node

/**
 * Test script to verify the benchmark setup
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3001';
const TEST_USER = `test-user-${Date.now()}`;
const TEST_DATA = {
  userId: TEST_USER,
  payload: {
    test: 'benchmark',
    timestamp: new Date().toISOString(),
    value: Math.random() * 1000
  }
};

async function runTest(variant) {
  console.log(`\n🔍 Testing variant: ${variant}`);
  
  try {
    // First request (likely cache miss)
    console.log('  First request (likely cache miss)...');
    const response1 = await axios.post(
      `${BASE_URL}/api/benchmark`,
      { ...TEST_DATA, variant }
    );
    
    console.log(`  Status: ${response1.status}`);
    console.log(`  Storage: ${response1.headers['x-storage-source']}`);
    console.log(`  Cache: ${response1.headers['x-cache-hit'] === 'true' ? 'HIT' : 'MISS'}`);
    console.log(`  Duration: ${response1.duration}ms`);
    
    // Second request (likely cache hit if supported)
    console.log('\n  Second request (likely cache hit)...');
    const response2 = await axios.post(
      `${BASE_URL}/api/benchmark`,
      { ...TEST_DATA, variant }
    );
    
    console.log(`  Status: ${response2.status}`);
    console.log(`  Storage: ${response2.headers['x-storage-source']}`);
    console.log(`  Cache: ${response2.headers['x-cache-hit'] === 'true' ? 'HIT' : 'MISS'}`);
    console.log(`  Duration: ${response2.duration}ms`);
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('  Response data:', error.response.data);
      console.error('  Status:', error.response.status);
    }
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting benchmark test suite');
  console.log('==============================');
  
  // Check if server is running
  try {
    const health = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ Server is running (${health.data.version})`);
  } catch (error) {
    console.error('❌ Server is not running. Please start the test server first:');
    console.error('   node testing/benchmark/test-server.js');
    process.exit(1);
  }
  
  // Run tests for each variant
  const variants = ['hierarchical', 'distributed', 'hybrid'];
  let allPassed = true;
  
  for (const variant of variants) {
    const passed = await runTest(variant);
    if (!passed) allPassed = false;
  }
  
  console.log('\n🎉 Test suite completed');
  console.log('====================');
  console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
  
  if (allPassed) {
    console.log('\nNext steps:');
    console.log('1. Run a benchmark: npm run test:benchmark -- --variant hierarchical');
    console.log('2. Compare results: npm run test:benchmark:compare');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runAllTests().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
