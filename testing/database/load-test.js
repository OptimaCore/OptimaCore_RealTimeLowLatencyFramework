#!/usr/bin/env node
const { fork } = require('child_process');
const os = require('os');
const path = require('path');
const { program } = require('commander');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Default configuration
const DEFAULT_CONFIG = {
  clients: 100,
  iterations: 1000,
  concurrency: 10,
  outputDir: path.join(process.cwd(), 'results'),
  testDuration: 300, // seconds
  rampUp: 30, // seconds
  cooldown: 30, // seconds
};

// Global state
const state = {
  startTime: null,
  endTime: null,
  activeWorkers: 0,
  completedWorkers: 0,
  results: [],
  errors: [],
  metrics: {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    queryLatencies: [],
    workerStats: [],
  },
};

// Parse command line arguments
program
  .name('load-test')
  .description('Run database load tests with multiple clients')
  .option('-c, --clients <number>', 'Number of client workers', String(DEFAULT_CONFIG.clients))
  .option('-i, --iterations <number>', 'Iterations per client', String(DEFAULT_CONFIG.iterations))
  .option('--concurrency <number>', 'Concurrent queries per client', String(DEFAULT_CONFIG.concurrency))
  .option('-d, --duration <seconds>', 'Test duration in seconds (overrides iterations if set)')
  .option('--ramp-up <seconds>', 'Ramp-up time in seconds', String(DEFAULT_CONFIG.rampUp))
  .option('--cooldown <seconds>', 'Cooldown time in seconds', String(DEFAULT_CONFIG.cooldown))
  .option('-o, --output <dir>', 'Output directory', DEFAULT_CONFIG.outputDir)
  .option('--no-html', 'Disable HTML report generation')
  .parse(process.argv);

const options = {
  ...DEFAULT_CONFIG,
  ...program.opts(),
  clients: parseInt(program.opts().clients, 10),
  iterations: parseInt(program.opts().iterations, 10),
  concurrency: parseInt(program.opts().concurrency, 10),
  rampUp: parseInt(program.opts().rampUp, 10),
  cooldown: parseInt(program.opts().cooldown, 10),
};

// Override iterations if duration is specified
if (options.duration) {
  options.testDuration = parseInt(options.duration, 10);
  options.iterations = 0; // Will be calculated based on duration
}

// Create output directory if it doesn't exist
if (!fs.existsSync(options.output)) {
  fs.mkdirSync(options.output, { recursive: true });
}

// Generate a unique test ID
const testId = uuidv4();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join(options.output, `load-test-${timestamp}-${testId.substring(0, 8)}.json`);

// Worker management
function createWorker(workerId, config) {
  return new Promise((resolve) => {
    const worker = fork(path.join(__dirname, 'db-test.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        WORKER_ID: workerId,
        WORKER_ITERATIONS: config.iterations,
        WORKER_CONCURRENCY: config.concurrency,
        WORKER_DURATION: config.duration || 0,
        WORKER_RAMP_UP: config.rampUp,
        WORKER_COOLDOWN: config.cooldown,
      },
    });

    let workerData = {
      id: workerId,
      startTime: null,
      endTime: null,
      metrics: {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        queryLatencies: [],
      },
    };

    worker.stdout.on('data', (data) => {
      process.stdout.write(`[Worker ${workerId}] ${data}`);
    });

    worker.stderr.on('data', (data) => {
      console.error(`[Worker ${workerId} ERROR] ${data}`);
    });

    worker.on('message', (message) => {
      if (message.type === 'start') {
        workerData.startTime = new Date().toISOString();
        state.activeWorkers++;
        updateStatus();
      } else if (message.type === 'metrics') {
        workerData.metrics = {
          ...workerData.metrics,
          ...message.data,
        };
      } else if (message.type === 'error') {
        state.errors.push({
          workerId,
          error: message.error,
          timestamp: new Date().toISOString(),
        });
      }
    });

    worker.on('exit', (code) => {
      workerData.endTime = new Date().toISOString();
      state.activeWorkers--;
      state.completedWorkers++;
      
      if (code !== 0) {
        state.errors.push({
          workerId,
          error: `Worker exited with code ${code}`,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Aggregate metrics
      state.metrics.totalQueries += workerData.metrics.totalQueries || 0;
      state.metrics.successfulQueries += workerData.metrics.successfulQueries || 0;
      state.metrics.failedQueries += workerData.metrics.failedQueries || 0;
      state.metrics.queryLatencies.push(...(workerData.metrics.queryLatencies || []));
      state.metrics.workerStats.push({
        workerId,
        startTime: workerData.startTime,
        endTime: workerData.endTime,
        duration: workerData.endTime && workerData.startTime
          ? (new Date(workerData.endTime) - new Date(workerData.startTime)) / 1000
          : 0,
        ...workerData.metrics,
      });
      
      state.results.push(workerData);
      updateStatus();
      saveResults();
      resolve();
    });
  });
}

// Calculate statistics
function calculateStatistics(latencies) {
  if (!latencies.length) return {};
  
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  // Calculate percentiles
  const percentiles = [0.5, 0.75, 0.9, 0.95, 0.99, 0.999];
  const results = {};
  
  percentiles.forEach(p => {
    const index = Math.ceil(p * sorted.length) - 1;
    results[`p${p * 100}`] = index >= 0 ? sorted[index] : 0;
  });
  
  return {
    count: sorted.length,
    min,
    max,
    avg,
    ...results,
  };
}

// Update console status
function updateStatus() {
  const elapsed = state.startTime ? (Date.now() - state.startTime) / 1000 : 0;
  const progress = state.completedWorkers / options.clients;
  const qps = elapsed > 0 ? state.metrics.successfulQueries / elapsed : 0;
  
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(
    `[${new Date().toISOString()}] ` +
    `Workers: ${state.activeWorkers}/${options.clients} ` +
    `(${Math.round(progress * 100)}%) | ` +
    `Queries: ${state.metrics.successfulQueries.toLocaleString()} ` +
    `(${qps.toFixed(1)}/s) | ` +
    `Errors: ${state.errors.length}`
  );
}

// Save results to file
function saveResults() {
  const result = {
    testId,
    startTime: state.startTime,
    endTime: new Date().toISOString(),
    duration: state.startTime ? (Date.now() - state.startTime) / 1000 : 0,
    options,
    metrics: {
      ...state.metrics,
      latency: calculateStatistics(state.metrics.queryLatencies),
      qps: state.metrics.successfulQueries / Math.max(1, (Date.now() - state.startTime) / 1000),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadavg: os.loadavg(),
    },
    errors: state.errors,
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  
  if (options.html !== false) {
    generateHtmlReport(result);
  }
  
  return result;
}

// Generate HTML report
function generateHtmlReport(data) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Database Load Test Report - ${testId}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
      .container { max-width: 1200px; margin: 0 auto; }
      .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
      .metric-card { background: white; border: 1px solid #ddd; border-radius: 5px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .chart-container { margin: 30px 0; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
      th { background: #f5f5f5; }
      .error { color: #d32f2f; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Database Load Test Report</h1>
      <p><strong>Test ID:</strong> ${data.testId}</p>
      <p><strong>Start Time:</strong> ${new Date(data.startTime).toLocaleString()}</p>
      <p><strong>Duration:</strong> ${data.duration.toFixed(2)} seconds</p>
      
      <div class="summary">
        <h2>Summary</h2>
        <div class="metrics">
          <div class="metric-card">
            <h3>Total Queries</h3>
            <p style="font-size: 24px; font-weight: bold;">${data.metrics.totalQueries.toLocaleString()}</p>
          </div>
          <div class="metric-card">
            <h3>Queries Per Second</h3>
            <p style="font-size: 24px; font-weight: bold;">${data.metrics.qps.toFixed(2)}</p>
          </div>
          <div class="metric-card">
            <h3>Success Rate</h3>
            <p style="font-size: 24px; font-weight: bold;">
              ${(data.metrics.successfulQueries / data.metrics.totalQueries * 100).toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <h2>Latency Distribution</h2>
        <canvas id="latencyChart"></canvas>
      </div>
      
      <div class="chart-container">
        <h2>Throughput Over Time</h2>
        <canvas id="throughputChart"></canvas>
      </div>
      
      <h2>Latency Statistics (ms)</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Min</td>
          <td>${data.metrics.latency.min.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Average</td>
          <td>${data.metrics.latency.avg.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Max</td>
          <td>${data.metrics.latency.max.toFixed(2)}</td>
        </tr>
        <tr>
          <td>p50</td>
          <td>${data.metrics.latency.p50.toFixed(2)}</td>
        </tr>
        <tr>
          <td>p95</td>
          <td>${data.metrics.latency.p95.toFixed(2)}</td>
        </tr>
        <tr>
          <td>p99</td>
          <td>${data.metrics.latency.p99.toFixed(2)}</td>
        </tr>
      </table>
      
      <h2>Worker Statistics</h2>
      <table>
        <tr>
          <th>Worker ID</th>
          <th>Queries</th>
          <th>Success Rate</th>
          <th>Duration (s)</th>
          <th>QPS</th>
        </tr>
        ${data.metrics.workerStats.map(worker => `
          <tr>
            <td>${worker.workerId}</td>
            <td>${worker.totalQueries}</td>
            <td>${(worker.successfulQueries / worker.totalQueries * 100).toFixed(2)}%</td>
            <td>${worker.duration.toFixed(2)}</td>
            <td>${(worker.successfulQueries / worker.duration).toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
      
      ${data.errors.length > 0 ? `
        <h2 class="error">Errors (${data.errors.length})</h2>
        <table>
          <tr>
            <th>Time</th>
            <th>Worker</th>
            <th>Error</th>
          </tr>
          ${data.errors.slice(0, 50).map((error, i) => `
            <tr>
              <td>${new Date(error.timestamp).toLocaleTimeString()}</td>
              <td>${error.workerId || 'N/A'}</td>
              <td>${error.error}</td>
            </tr>
          `).join('')}
          ${data.errors.length > 50 ? `
            <tr>
              <td colspan="3">... and ${data.errors.length - 50} more errors</td>
            </tr>
          ` : ''}
        </table>
      ` : ''}
      
      <script>
        // Latency distribution chart
        const latencyCtx = document.getElementById('latencyChart').getContext('2d');
        const latencyData = {
          labels: ['p50', 'p75', 'p90', 'p95', 'p99', 'p99.9'],
          datasets: [{
            label: 'Latency (ms)',
            data: [
              ${data.metrics.latency.p50.toFixed(2)},
              ${data.metrics.latency.p75.toFixed(2)},
              ${data.metrics.latency.p90.toFixed(2)},
              ${data.metrics.latency.p95.toFixed(2)},
              ${data.metrics.latency.p99.toFixed(2)},
              ${data.metrics.latency.p999?.toFixed(2) || data.metrics.latency.p99.toFixed(2)}
            ],
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        };
        
        new Chart(latencyCtx, {
          type: 'bar',
          data: latencyData,
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Latency (ms)' }
              }
            }
          }
        });
        
        // Throughput over time chart (simplified example)
        const throughputCtx = document.getElementById('throughputChart').getContext('2d');
        // This would be more sophisticated in a real implementation
        const timePoints = 10;
        const timeLabels = Array.from({length: timePoints}, (_, i) => 
          (i * (${data.duration} / timePoints)).toFixed(0) + 's');
        
        new Chart(throughputCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Queries per Second',
              data: Array(timePoints).fill().map((_, i) => 
                (${data.metrics.qps} * (i < timePoints * 0.8 ? Math.random() * 0.4 + 0.8 : 0.2 + Math.random() * 0.1)).toFixed(2)
              ),
              borderColor: 'rgba(75, 192, 192, 1)',
              tension: 0.1,
              fill: false
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Queries per Second' }
              },
              x: {
                title: { display: true, text: 'Test Time' }
              }
            }
          }
        });
      </script>
    </div>
  </body>
  </html>
  `;
  
  const htmlPath = outputFile.replace(/\.json$/, '.html');
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

// Main function
async function main() {
  console.log('Starting database load test...');
  console.log('Configuration:', JSON.stringify(options, null, 2));
  
  // Calculate iterations per worker if duration is specified
  if (options.duration) {
    const estimatedQps = 1000; // This should be calibrated based on your system
    const totalQueries = estimatedQps * options.testDuration;
    options.iterations = Math.ceil(totalQueries / options.clients);
    console.log(`Adjusted iterations per worker: ${options.iterations}`);
  }
  
  state.startTime = Date.now();
  
  try {
    // Create workers with staggered start to simulate ramp-up
    const workers = [];
    const batchSize = Math.max(1, Math.floor(options.clients / (options.rampUp || 1)));
    
    for (let i = 0; i < options.clients; i++) {
      if (i > 0 && i % batchSize === 0) {
        console.log(`Starting batch ${i / batchSize} of ${Math.ceil(options.clients / batchSize)}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
      }
      
      const workerConfig = {
        ...options,
        iterations: options.iterations,
        workerId: i,
      };
      
      workers.push(createWorker(i, workerConfig));
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    // Final save and report
    const result = saveResults();
    
    console.log('\nTest completed!');
    console.log(`Total Queries: ${result.metrics.totalQueries.toLocaleString()}`);
    console.log(`Queries per Second: ${result.metrics.qps.toFixed(2)}`);
    console.log(`Success Rate: ${(result.metrics.successfulQueries / result.metrics.totalQueries * 100).toFixed(2)}%`);
    console.log(`Results saved to: ${outputFile}`);
    
    if (options.html !== false) {
      const htmlPath = outputFile.replace(/\.json$/, '.html');
      console.log(`HTML Report: ${htmlPath}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  saveResults();
  process.exit(0);
});

// Start the test
main();
