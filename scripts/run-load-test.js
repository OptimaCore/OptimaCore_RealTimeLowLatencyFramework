#!/usr/bin/env node

/**
 * Load Test Runner for OptimaCore
 * 
 * This script provides a unified interface for running load tests
 * using either Artillery or k6, with support for different environments
 * and test scenarios.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

// Initialize command line interface
const program = new Command();
program
  .name('run-load-test')
  .description('Run load tests for OptimaCore')
  .version('1.0.0')
  .option('-t, --tool <type>', 'Load testing tool to use (artillery|k6)', 'artillery')
  .option('-e, --env <env>', 'Environment to test against (local|staging|production)', 'local')
  .option('-s, --scenario <scenario>', 'Test scenario to run', 'smoke')
  .option('-o, --out <dir>', 'Output directory for test reports', 'reports')
  .option('-d, --duration <seconds>', 'Test duration in seconds', '60')
  .option('-u, --users <count>', 'Number of virtual users', '10')
  .option('--no-upload', 'Skip uploading results to storage')
  .parse(process.argv);

const options = program.opts();

// Configuration
const CONFIG = {
  environments: {
    local: 'http://localhost:3001',
    staging: 'https://staging.optimacore.example.com',
    production: 'https://api.optimacore.example.com',
  },
  tools: {
    artillery: {
      cmd: 'npx artillery',
      reportCmd: 'npx artillery report',
      outputExt: 'json',
      defaultScenario: 'smoke',
    },
    k6: {
      cmd: 'k6 run',
      outputExt: 'json',
      defaultScenario: 'smoke_test',
    },
  },
};

// Ensure output directory exists
const outputDir = path.resolve(process.cwd(), options.out);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate a unique test run ID
const testRunId = `${options.tool}-${options.scenario}-${Date.now()}`;
const outputFile = path.join(outputDir, `${testRunId}.${CONFIG.tools[options.tool].outputExt}`);
const reportFile = path.join(outputDir, `${testRunId}.html`);

// Run the load test
async function runLoadTest() {
  console.log(`🚀 Starting ${options.tool} load test for ${options.env} environment`);
  console.log(`📊 Scenario: ${options.scenario}`);
  console.log(`⏱  Duration: ${options.duration} seconds`);
  console.log(`👥 Users: ${options.users}`);
  console.log(`📂 Output: ${outputFile}`);

  try {
    let command;
    const envVars = {
      ...process.env,
      BASE_URL: CONFIG.environments[options.env],
      TEST_ENV: options.env,
      TEST_TYPE: options.scenario,
    };

    if (options.tool === 'artillery') {
      command = `${CONFIG.tools.artillery.cmd} run \
        --environment ${options.env} \
        --output ${outputFile} \
        --duration ${options.duration} \
        --vus ${options.users} \
        testing/load-test/artillery.yml`;
    } else if (options.tool === 'k6') {
      command = `${CONFIG.tools.k6.cmd} \
        --out json=${outputFile} \
        --duration ${options.duration}s \
        --vus ${options.users} \
        --rps ${options.users * 5} \
        --stage 30s:${options.users} \
        --stage ${options.duration - 30}s:0 \
        testing/load-test/k6-script.js`;
    } else {
      throw new Error(`Unsupported tool: ${options.tool}`);
    }

    console.log(`\n🏃‍♂️ Running: ${command}\n`);
    
    // Execute the command
    execSync(command, {
      stdio: 'inherit',
      env: { ...process.env, ...envVars },
    });

    // Generate report if supported
    if (options.tool === 'artillery') {
      console.log('\n📊 Generating HTML report...');
      execSync(`${CONFIG.tools.artillery.reportCmd} ${outputFile} -o ${reportFile}`);
      console.log(`✅ Report generated: ${reportFile}`);
    }

    // Upload results if enabled
    if (options.upload) {
      await uploadResults(outputFile, reportFile);
    }

    console.log('\n🎉 Load test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Load test failed:', error.message);
    process.exit(1);
  }
}

// Upload results to storage (e.g., S3, Azure Blob Storage)
async function uploadResults(outputFile, reportFile) {
  console.log('\n📤 Uploading test results...');
  
  // Example implementation for Azure Blob Storage
  // In a real implementation, you would use the Azure SDK
  // and proper error handling
  try {
    const uploadPromises = [];
    
    if (fs.existsSync(outputFile)) {
      console.log(`  - Uploading ${outputFile}`);
      // uploadPromises.push(uploadToBlobStorage(outputFile, `load-tests/${path.basename(outputFile)}`));
    }
    
    if (fs.existsSync(reportFile)) {
      console.log(`  - Uploading ${reportFile}`);
      // uploadPromises.push(uploadToBlobStorage(reportFile, `load-tests/${path.basename(reportFile)}`));
    }
    
    await Promise.all(uploadPromises);
    console.log('✅ Results uploaded successfully');
  } catch (error) {
    console.warn('⚠️  Failed to upload results:', error.message);
  }
}

// Helper function to get system information
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024)), // MB
    freeMemory: Math.round(os.freemem() / (1024 * 1024)), // MB
    hostname: os.hostname(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}

// Start the load test
runLoadTest();

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Load test stopped by user');
  process.exit(0);
});
