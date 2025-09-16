#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function setupTestEnvironment() {
  try {
    console.log('🚀 Setting up test environment...');
    
    // Load environment variables
    const env = process.env;
    const resourceGroup = `optima-core-${env.GITHUB_RUN_ID}`;
    const location = env.LOCATION || 'eastus';
    
    // Create resource group
    console.log(`Creating resource group: ${resourceGroup}`);
    execSync(`az group create --name ${resourceGroup} --location ${location}`, { stdio: 'inherit' });
    
    // Deploy infrastructure
    console.log('🚀 Deploying infrastructure...');
    process.chdir(path.join(__dirname, '../infrastructure'));
    
    // Initialize Terraform
    execSync('terraform init', { stdio: 'inherit' });
    
    // Apply Terraform
    const tfVars = {
      environment: env.TF_VAR_environment || 'test',
      github_sha: env.GITHUB_SHA || 'local',
      github_run_id: env.GITHUB_RUN_ID || Date.now().toString()
    };
    
    const varArgs = Object.entries(tfVars)
      .map(([key, value]) => `-var="${key}=${value}"`)
      .join(' ');
    
    execSync(`terraform validate ${varArgs}`, { stdio: 'inherit' });
    execSync(`terraform plan ${varArgs} -out=tfplan`, { stdio: 'inherit' });
    execSync('terraform apply -auto-approve tfplan', { stdio: 'inherit' });
    
    // Get outputs
    const outputs = JSON.parse(execSync('terraform output -json').toString());
    const webappUrl = outputs.webapp_url.value;
    const apiUrl = outputs.api_url.value;
    
    console.log('✅ Environment setup complete!');
    console.log(`🌐 Web App: ${webappUrl}`);
    console.log(`🛠️ API: ${apiUrl}`);
    
    // Set output variables for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `webapp_url=${webappUrl}\napi_url=${apiUrl}\n`
      );
    }
    
    return { webappUrl, apiUrl };
  } catch (error) {
    console.error('❌ Error setting up test environment:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupTestEnvironment();
}

module.exports = { setupTestEnvironment };
