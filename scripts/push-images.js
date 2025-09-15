#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const packageJson = require('../package.json');

// Configuration
const config = {
  appName: 'optima',
  registry: 'ghcr.io/optimacore',
  version: process.env.VERSION || 'latest',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

// Utility functions
const log = (message, color = '') => {
  console.log(`${color}${message}${colors.reset}`);
};

const runCommand = (command) => {
  log(`Running: ${command}`, colors.blue);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    log(`Error executing command: ${command}`, colors.yellow);
    return false;
  }
};

const prompt = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Check if user is logged in to the container registry
const checkLoggedIn = async () => {
  log('\n🔒 Checking Docker registry authentication...', colors.blue);
  
  try {
    // Try to get the auth config
    execSync('docker info | grep "Username"', { stdio: 'pipe' });
    return true;
  } catch (error) {
    log('\n⚠️  You are not logged in to the container registry.', colors.yellow);
    const login = await prompt('Do you want to log in to the registry now? (y/n) ');
    
    if (login.toLowerCase() === 'y') {
      log('\nPlease log in to the container registry...', colors.blue);
      return runCommand(`docker login ${config.registry}`);
    }
    
    return false;
  }
};

// Push Docker images
const pushImages = async () => {
  log('\n🚀 Starting Docker image push process', colors.bright);
  
  // Check if user is logged in
  if (!(await checkLoggedIn())) {
    log('\n❌ Aborting: Authentication required to push images', colors.red);
    process.exit(1);
  }
  
  // Push API image
  log('\n📤 Pushing API image...', colors.green);
  const apiImageName = `${config.registry}/${config.appName}-api:${config.version}`;
  
  if (!runCommand(`docker push ${apiImageName}`)) {
    log(`\n⚠️  Failed to push API image: ${apiImageName}`, colors.yellow);
    log('  Make sure the image exists and you have the correct permissions.', colors.yellow);
    process.exit(1);
  }
  
  // Push Frontend image
  log('\n📤 Pushing Frontend image...', colors.green);
  const frontendImageName = `${config.registry}/${config.appName}-frontend:${config.version}`;
  
  if (!runCommand(`docker push ${frontendImageName}`)) {
    log(`\n⚠️  Failed to push Frontend image: ${frontendImageName}`, colors.yellow);
    log('  Make sure the image exists and you have the correct permissions.', colors.yellow);
    process.exit(1);
  }
  
  log('\n✅ All images pushed successfully!', colors.green);
  log(`\n📦 Images pushed to registry (${config.registry}):`);
  log(`  - ${apiImageName}`, colors.blue);
  log(`  - ${frontendImageName}`, colors.blue);
  
  return { apiImageName, frontendImageName };
};

// Main function
const main = async () => {
  log('🚀 OptimaCore Docker Push Script', colors.bright);
  log(`📦 Version: ${config.version}`, colors.blue);
  log(`📝 Registry: ${config.registry}\n`, colors.blue);
  
  // Check if Docker is running
  if (!runCommand('docker info')) {
    log('❌ Docker is not running. Please start Docker and try again.', colors.red);
    process.exit(1);
  }
  
  // Push images
  await pushImages();
  
  log('\n🏁 Push process completed successfully!', colors.green);
  log('\nNext steps:', colors.bright);
  log('1. Update your deployment configuration with the new image tags', colors.blue);
  log('2. Deploy the updated services to your environment\n', colors.blue);
};

// Run the script
main().catch(error => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});
