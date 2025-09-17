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
    
    if (!result) {
      console.log('No resource groups found');
      return;
    }
    
    const resourceGroups = JSON.parse(result);
    const now = new Date();
    const maxAgeDays = 7; // Keep resources for 7 days
    
    for (const rg of resourceGroups) {
      if (!rg.created) continue;
      
      const created = new Date(rg.created);
      const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      
      if (ageInDays > maxAgeDays) {
        console.log(`Deleting old resource group: ${rg.name} (${ageInDays} days old)`);
        try {
          // Delete any locks on the resource group first
          try {
            const locks = JSON.parse(execSync(
              `az lock list --resource-group ${rg.name} --query "[].{name:name, type:type}" --output json`
            ).toString());
            
            for (const lock of locks) {
              console.log(`Deleting lock: ${lock.name}`);
              try {
                execSync(
                  `az lock delete --name ${lock.name} --resource-group ${rg.name} --resource-type ${lock.type}`, 
                  { stdio: 'inherit' }
                );
              } catch (lockError) {
                console.warn(`Could not delete lock ${lock.name}:`, lockError.message);
              }
            }
          } catch (lockError) {
            console.warn(`Could not list or delete locks for ${rg.name}:`, lockError.message);
          }
          
          // Delete the resource group
          console.log(`Deleting resource group: ${rg.name}`);
          execSync(
            `az group delete --name ${rg.name} --yes --no-wait`,
            { stdio: 'inherit' }
          );
          console.log(`Scheduled deletion of resource group: ${rg.name}`);
        } catch (error) {
          console.error(`Error deleting ${rg.name}:`, error.message);
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
