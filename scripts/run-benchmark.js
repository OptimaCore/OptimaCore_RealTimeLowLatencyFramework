#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const { performance } = require('perf_hooks');
const Telemetry = require('../services/telemetry');

// Parse command line arguments
program
  .requiredOption('-u, --url <url>', 'URL to benchmark')
  .option('-o, --out <file>', 'Output file path (default: telemetry-results_<timestamp>.json)')
  .option('-n, --requests <number>', 'Number of requests to make', 1)
  .option('--no-appinsights', 'Disable Application Insights export')
  .option('--no-file', 'Disable file export')
  .parse(process.argv);

const options = program.opts();

// Validate URL
let url;
try {
  url = new URL(options.url);
} catch (error) {
  console.error('Invalid URL:', options.url);
  process.exit(1);
}

// Initialize telemetry
const telemetry = new Telemetry({
  enableAppInsights: options.appinsights,
  enableFileLogging: options.file,
  region: process.env.AZURE_REGION || 'eastus'
});

// Function to make an HTTP request and collect metrics
async function makeRequest(url) {
  const context = await telemetry.startRequest();
  
  // Measure DNS lookup
  const dnsStart = performance.now();
  const dnsLookupTime = await telemetry.measureDnsLookup(url.hostname);
  const dnsEnd = performance.now();
  
  // Prepare request options
  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + (url.search || ''),
    method: 'GET',
    headers: {
      'User-Agent': 'OptimaCoreTelemetry/1.0',
      'Accept': '*/*'
    }
  };
  
  // Track timing metrics
  const timings = {
    dnsLookup: dnsLookupTime,
    tcpConnection: 0,
    tlsHandshake: 0,
    firstByte: 0,
    contentTransfer: 0,
    total: 0
  };
  
  // Track if we've received the first byte
  let firstByteReceived = false;
  let firstByteTime = 0;
  
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    let tcpHandshakeStart = 0;
    let tlsHandshakeStart = 0;
    
    const req = https.request(requestOptions, (res) => {
      // Track when we receive the first byte
      res.once('readable', () => {
        if (!firstByteReceived) {
          firstByteReceived = true;
          firstByteTime = performance.now();
          timings.firstByte = firstByteTime - startTime;
        }
      });
      
      // Track the end of the response
      res.on('end', () => {
        const endTime = performance.now();
        timings.contentTransfer = endTime - (firstByteReceived ? firstByteTime : startTime);
        timings.total = endTime - startTime;
        
        // Add metrics to context
        context.metrics = {
          dnsLookup: timings.dnsLookup,
          tlsHandshake: timings.tlsHandshake,
          firstByte: timings.firstByte,
          total: timings.total
        };
        
        // End the telemetry context
        telemetry.endRequest(context, {
          storageSource: 'ssd', // This would come from response headers in a real implementation
          cacheHit: res.headers['x-cache'] === 'HIT',
          dbType: 'none', // This would be determined by the request in a real implementation
          statusCode: res.statusCode,
          contentLength: res.headers['content-length'] || 0,
          contentType: res.headers['content-type'] || 'unknown'
        }).then(resolve).catch(reject);
      });
      
      // Ensure we consume the response data
      res.resume();
    });
    
    // Track TCP connection time
    req.on('socket', (socket) => {
      tcpHandshakeStart = performance.now();
      
      socket.on('lookup', () => {
        // DNS lookup already measured
      });
      
      socket.on('connect', () => {
        const tcpHandshakeTime = performance.now() - tcpHandshakeStart;
        timings.tcpConnection = tcpHandshakeTime;
        
        // If this is an HTTPS connection, track TLS handshake start
        if (url.protocol === 'https:') {
          tlsHandshakeStart = performance.now();
        }
      });
      
      socket.on('secureConnect', () => {
        if (tlsHandshakeStart > 0) {
          timings.tlsHandshake = performance.now() - tlsHandshakeStart;
        }
      });
      
      socket.on('error', (error) => {
        console.error('Socket error:', error);
        reject(error);
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    // End the request
    req.end();
  });
}

// Main function
async function runBenchmark() {
  console.log(`Starting benchmark for ${options.url} (${options.requests} requests)`);
  
  const results = [];
  
  for (let i = 0; i < options.requests; i++) {
    try {
      console.log(`Request ${i + 1}/${options.requests}...`);
      const result = await makeRequest(url);
      results.push(result);
      console.log(`  Status: ${result.metadata.statusCode}, Total Time: ${result.total_ms.toFixed(2)}ms`);
    } catch (error) {
      console.error(`Request ${i + 1} failed:`, error.message);
      // Continue with the next request even if one fails
    }
  }
  
  // Determine output file path
  let outputPath = options.out;
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outputPath = `telemetry-results_${timestamp}.json`;
  }
  
  // Ensure the directory exists
  const outputDir = path.dirname(outputPath);
  if (outputDir !== '.') {
    await fs.mkdir(outputDir, { recursive: true });
  }
  
  // Save results to file
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nBenchmark complete. Results saved to: ${outputPath}`);
  
  // Print summary
  if (results.length > 0) {
    const totalTime = results.reduce((sum, r) => sum + r.total_ms, 0);
    const avgTime = totalTime / results.length;
    const minTime = Math.min(...results.map(r => r.total_ms));
    const maxTime = Math.max(...results.map(r => r.total_ms));
    
    console.log('\nSummary:');
    console.log(`  Total Requests: ${results.length}`);
    console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average Time: ${avgTime.toFixed(2)}ms`);
    console.log(`  Min Time: ${minTime.toFixed(2)}ms`);
    console.log(`  Max Time: ${maxTime.toFixed(2)}ms`);
    console.log(`  Requests/sec: ${(results.length / (totalTime / 1000)).toFixed(2)}`);
  }
}

// Run the benchmark
runBenchmark().catch(console.error);
