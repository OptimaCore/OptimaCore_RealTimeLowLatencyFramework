#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function teardownEnvironment() {
  try {
    console.log('🧹 Cleaning up resources...');
    const env = process.env;
    const resourceGroup = `optima-core-${env.GITHUB_RUN_ID}`;
    
    // Check if resource group exists
    try {
      execSync(`az group show --name ${resourceGroup}`, { stdio: 'pipe' });
    } catch {
      console.log(`Resource group ${resourceGroup} not found, skipping teardown`);
      return;
    }
    
    // Destroy Terraform resources
    console.log('Destroying Terraform resources...');
    process.chdir(path.join(__dirname, '../infrastructure'));
    
    try {
      execSync('terraform init', { stdio: 'inherit' });
      execSync('terraform destroy -auto-approve', { stdio: 'inherit' });
    } catch (error) {
      console.error('Error during terraform destroy:', error);
    }
    
    // Delete resource group
    console.log(`Deleting resource group: ${resourceGroup}`);
    execSync(`az group delete --name ${resourceGroup} --yes --no-wait`, { stdio: 'inherit' });
    
    console.log('✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error during teardown:', error);
    process.exit(1);
  }
}

// Clean up old resource groups
async function cleanupOldResources() {
  try {
    console.log('🧹 Cleaning up old resource groups...');
    const result = execSync(
      `az group list --query "[?contains(name, 'optima-core-')].{name:name,created:tags.Created}" --output json`
    ).toString();
    
    const resourceGroups = JSON.parse(result);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    for (const group of resourceGroups) {
      const createdDate = new Date(group.created);
      if (createdDate < oneDayAgo) {
        console.log(`Deleting old resource group: ${group.name}`);
        try {
          execSync(`az group delete --name ${group.name} --yes --no-wait`, { stdio: 'inherit' });
        } catch (error) {
          console.error(`Error deleting ${group.name}:`, error.message);
        }
      }
    }
    
    console.log('✅ Old resource groups cleanup complete!');
  } catch (error) {
    console.error('❌ Error during resource cleanup:', error);
  }
}

if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'teardown':
      teardownEnvironment();
      break;
    case 'cleanup':
      cleanupOldResources();
      break;
    default:
      console.log('Usage: node teardown.js [teardown|cleanup]');
      process.exit(1);
  }
}

module.exports = { teardownEnvironment, cleanupOldResources };
