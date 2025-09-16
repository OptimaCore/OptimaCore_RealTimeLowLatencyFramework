#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');

// Parse command line arguments
program
  .option('--validate-only', 'Only validate the alert rules without testing')
  .parse(process.argv);

const options = program.opts();

// Paths
const alertRulesPath = path.join(__dirname, '../alerts/alert-rules.json');
const runbookPath = path.join(__dirname, '../monitoring/alert-runbook.md');

// Test alert rules file
try {
  console.log('\n=== Testing Alert Rules ===');
  
  // Check if alert rules file exists
  if (!fs.existsSync(alertRulesPath)) {
    throw new Error(`Alert rules file not found at ${alertRulesPath}`);
  }
  
  // Load and parse alert rules
  const alertRules = JSON.parse(fs.readFileSync(alertRulesPath, 'utf8'));
  
  // Basic validation
  if (!alertRules.resources || !Array.isArray(alertRules.resources)) {
    throw new Error('Invalid alert rules format: missing resources array');
  }
  
  console.log(`✅ Found ${alertRules.resources.length} alert rules`);
  
  // Check for required alert rules
  const requiredAlerts = [
    'HighRequestLatency',
    'LowCacheHitRatio',
    'HighRUConsumption',
    'HighDatabaseConnections',
    'HighErrorRate'
  ];
  
  const foundAlerts = new Set();
  
  alertRules.resources.forEach(rule => {
    if (rule.name) {
      const alertName = rule.name.split('-').pop();
      foundAlerts.add(alertName);
    }
  });
  
  // Check for missing alerts
  const missingAlerts = requiredAlerts.filter(alert => !foundAlerts.has(alert));
  
  if (missingAlerts.length > 0) {
    throw new Error(`Missing required alert rules: ${missingAlerts.join(', ')}`);
  }
  
  console.log('✅ All required alert rules are present');
  
  // Test runbook exists
  if (!fs.existsSync(runbookPath)) {
    throw new Error(`Alert runbook not found at ${runbookPath}`);  
  }
  
  console.log('✅ Alert runbook exists');
  
  // If not just validating, test alert deployment
  if (!options.validateOnly) {
    console.log('\n=== Testing Alert Deployment ===');
    
    // Check for required environment variables
    const requiredVars = ['RESOURCE_GROUP', 'APP_INSIGHTS_NAME'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn('⚠️  Missing required environment variables. Skipping deployment test.');
      console.warn('   Please set the following variables:');
      missingVars.forEach(varName => console.warn(`   - ${varName}`));
      console.warn('\nTo test deployment, run:');
      console.warn(`   RESOURCE_GROUP=your-rg APP_INSIGHTS_NAME=your-ai node ${__filename}`);
      process.exit(0);
    }
    
    // Test deployment
    console.log('Testing alert rules deployment...');
    try {
      execSync(
        `az deployment group validate \
        --resource-group ${process.env.RESOURCE_GROUP} \
        --template-file ${alertRulesPath} \
        --parameters appInsightsName=${process.env.APP_INSIGHTS_NAME}`,
        { stdio: 'inherit' }
      );
      console.log('✅ Alert rules validation successful');
    } catch (error) {
      throw new Error(`Alert rules validation failed: ${error.message}`);
    }
  }
  
  console.log('\n🎉 All alert tests passed!');
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Alert test failed:');
  console.error(error.message);
  process.exit(1);
}
