#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const packageJson = require('../package.json');

// Configuration
const config = {
  appName: 'optima',
  registry: 'ghcr.io/optimacore',
  version: process.env.VERSION || 'latest',
  buildArgs: {
    NODE_ENV: 'production',
    BUILD_DATE: new Date().toISOString(),
    VERSION: process.env.VERSION || 'local',
    GIT_COMMIT: process.env.GIT_COMMIT || 'local',
  },
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Utility functions
const log = (message, color = '') => {
  console.log(`${color}${message}${colors.reset}`);
};

const runCommand = (command, cwd = process.cwd()) => {
  log(`Running: ${command}`, colors.blue);
  try {
    execSync(command, { stdio: 'inherit', cwd });
    return true;
  } catch (error) {
    log(`Error executing command: ${command}`, colors.yellow);
    return false;
  }
};

// Build Docker images
const buildImages = async () => {
  log('\n🚀 Starting Docker image build process', colors.bright);
  
  // Build API image
  log('\n🔨 Building API image...', colors.green);
  let buildArgs = Object.entries(config.buildArgs)
    .map(([key, value]) => `--build-arg ${key}=${value}`)
    .join(' ');
  
  const apiImageName = `${config.registry}/${config.appName}-api:${config.version}`;
  const apiBuildCmd = `docker build -f Dockerfile.api -t ${apiImageName} ${buildArgs} .`;
  
  if (!runCommand(apiBuildCmd)) {
    log('❌ Failed to build API image', colors.yellow);
    process.exit(1);
  }
  
  // Build Frontend image
  log('\n🔨 Building Frontend image...', colors.green);
  const frontendImageName = `${config.registry}/${config.appName}-frontend:${config.version}`;
  const frontendBuildCmd = `docker build -t ${frontendImageName} ${buildArgs} .`;
  
  if (!runCommand(frontendBuildCmd)) {
    log('❌ Failed to build Frontend image', colors.yellow);
    process.exit(1);
  }
  
  log('\n✅ All images built successfully!', colors.green);
  log(`\n📦 Images created:`);
  log(`  - ${apiImageName}`, colors.blue);
  log(`  - ${frontendImageName}`, colors.blue);
  
  return { apiImageName, frontendImageName };
};

// Main function
const main = async () => {
  log('🎯 OptimaCore Docker Build Script', colors.bright);
  log(`📦 Version: ${config.version}\n`, colors.blue);
  
  // Check if Docker is running
  if (!runCommand('docker info')) {
    log('❌ Docker is not running. Please start Docker and try again.', colors.yellow);
    process.exit(1);
  }
  
  // Build images
  const images = await buildImages();
  
  log('\n🏁 Build process completed successfully!', colors.green);
  log('\nTo run the application locally, use:', colors.bright);
  log('  docker-compose up -d\n', colors.blue);
  
  log('To push the images to the registry, run:', colors.bright);
  log(`  docker push ${images.apiImageName}`, colors.blue);
  log(`  docker push ${images.frontendImageName}\n`, colors.blue);
};

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
