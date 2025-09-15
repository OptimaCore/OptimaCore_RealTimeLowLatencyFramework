#!/usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const { table } = require('table');
const chalk = require('chalk');
const { healthService } = require('../services/health');

// Parse command line arguments
program
  .option('-u, --url <url>', 'Base URL to check (default: http://localhost:3000)')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', 5000)
  .option('-r, --retry <n>', 'Number of retries on failure', 3)
  .option('-i, --interval <ms>', 'Check interval in milliseconds', 10000)
  .option('-v, --verbose', 'Show verbose output')
  .option('--no-color', 'Disable colored output')
  .parse(process.argv);

const options = program.opts();
const baseUrl = options.url || 'http://localhost:3000';

// Disable colors if requested
if (options.color === false) {
  chalk.level = 0;
}

// Configure axios
const http = axios.create({
  baseURL: baseUrl,
  timeout: options.timeout,
  headers: {
    'User-Agent': 'OptimaCore-HealthCheck/1.0',
    'Accept': 'application/json'
  }
});

// Track stats
const stats = {
  startTime: new Date(),
  checks: 0,
  failures: 0,
  totalResponseTime: 0
};

// Format bytes to human-readable string
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format milliseconds to human-readable string
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}.${String(ms % 1000).padStart(3, '0')}s`;
  }
}

// Make a health check request
async function checkHealth() {
  const startTime = process.hrtime();
  let attempt = 0;
  let lastError;
  
  while (attempt < options.retry) {
    attempt++;
    
    try {
      const response = await http.get('/health');
      const endTime = process.hrtime(startTime);
      const responseTime = (endTime[0] * 1000) + (endTime[1] / 1e6);
      
      // Update stats
      stats.checks++;
      stats.totalResponseTime += responseTime;
      
      return {
        success: true,
        status: response.status,
        data: response.data,
        responseTime,
        attempt
      };
    } catch (error) {
      lastError = error;
      
      if (attempt < options.retry) {
        if (options.verbose) {
          console.log(chalk.yellow(`Attempt ${attempt} failed, retrying...`));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // If we get here, all attempts failed
  stats.checks++;
  stats.failures++;
  
  return {
    success: false,
    error: lastError,
    attempt
  };
}

// Make a readiness check request
async function checkReadiness() {
  try {
    const response = await http.get('/ready');
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      error: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : error.message
    };
  }
}

// Display health check results
function displayResults(results) {
  const { success, responseTime, data, attempt } = results;
  const now = new Date();
  
  // Calculate success rate
  const successRate = stats.checks > 0 
    ? Math.round(((stats.checks - stats.failures) / stats.checks) * 100) 
    : 0;
  
  // Calculate average response time
  const avgResponseTime = stats.checks > 0 
    ? stats.totalResponseTime / (stats.checks - stats.failures) 
    : 0;
  
  // Build status line
  let statusLine = `[${now.toISOString()}] `;
  
  if (success) {
    statusLine += chalk.green.bold('✓');
    statusLine += ` Health check passed in ${responseTime.toFixed(2)}ms`;
    
    if (attempt > 1) {
      statusLine += chalk.yellow(` (after ${attempt} attempts)`);
    }
    
    statusLine += ` | Success: ${chalk.green(successRate)}%`;
    statusLine += ` | Avg: ${avgResponseTime.toFixed(2)}ms`;
    statusLine += ` | Uptime: ${formatDuration(process.uptime() * 1000)}`;
    
    // Add memory usage if available
    if (data && data.meta && data.meta.memory) {
      const { heapUsed, heapTotal, rss } = data.meta.memory;
      statusLine += ` | Mem: ${chalk.cyan(formatBytes(heapUsed))}/${chalk.cyan(formatBytes(heapTotal))} (${chalk.cyan(formatBytes(rss))} RSS)`;
    }
  } else {
    statusLine += chalk.red.bold('✗');
    statusLine += ` Health check failed`;
    
    if (results.error) {
      const error = results.error.response ? 
        `HTTP ${results.error.response.status}: ${JSON.stringify(results.error.response.data)}` : 
        results.error.message || 'Unknown error';
      
      statusLine += `: ${chalk.red(error)}`;
    }
    
    statusLine += ` | Success: ${chalk.red(successRate)}%`;
    statusLine += ` | Failures: ${chalk.red(stats.failures)}`;
  }
  
  console.log(statusLine);
  
  // Show detailed component status in verbose mode
  if (options.verbose && success && data && data.checks) {
    console.log('\nComponent Status:');
    
    const componentRows = [
      [
        chalk.bold('Component'), 
        chalk.bold('Status'), 
        chalk.bold('Details')
      ]
    ];
    
    for (const [name, check] of Object.entries(data.checks)) {
      const status = check.status === 'healthy' ? 
        chalk.green('✓ healthy') : 
        chalk.red(`✗ ${check.status}`);
      
      let details = '';
      
      if (name === 'memory' && check.usagePercent !== undefined) {
        const usage = check.usagePercent;
        const color = usage > 90 ? 'red' : usage > 70 ? 'yellow' : 'green';
        details = `Usage: ${chalk[color](usage.toFixed(1) + '%')} (${formatBytes(check.used)}/${formatBytes(check.total)})`;
      } else if (check.duration !== undefined) {
        details = `Duration: ${check.duration.toFixed(2)}ms`;
      }
      
      componentRows.push([name, status, details]);
    }
    
    console.log(table(componentRows, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      },
      columns: {
        0: { alignment: 'left' },
        1: { alignment: 'center' },
        2: { alignment: 'left' }
      }
    }));
  }
}

// Run a single health check
async function runCheck() {
  try {
    const results = await checkHealth();
    displayResults(results);
    return results.success;
  } catch (error) {
    console.error('Error running health check:', error);
    return false;
  }
}

// Run in continuous mode
async function runContinuous() {
  console.log(chalk.blue(`Starting health checks for ${baseUrl} (Ctrl+C to stop)`));
  
  // Initial check
  await runCheck();
  
  // Schedule periodic checks
  const intervalId = setInterval(async () => {
    await runCheck();
  }, options.interval);
  
  // Handle process termination
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    
    // Calculate and display summary
    const uptime = (new Date() - stats.startTime) / 1000;
    const successRate = stats.checks > 0 
      ? ((stats.checks - stats.failures) / stats.checks * 100).toFixed(1) 
      : 0;
    
    console.log('\n' + chalk.blue.bold('Summary:'));
    console.log(`  Checks: ${stats.checks}`);
    console.log(`  Failures: ${chalk[stats.failures > 0 ? 'red' : 'green'](stats.failures)}`);
    console.log(`  Success Rate: ${successRate}%`);
    console.log(`  Uptime: ${formatDuration(uptime * 1000)}`);
    
    process.exit(0);
  });
}

// Run once or in continuous mode
if (options.interval > 0) {
  runContinuous().catch(console.error);
} else {
  runCheck().then(success => {
    process.exit(success ? 0 : 1);
  });
}
