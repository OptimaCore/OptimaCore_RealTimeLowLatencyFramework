#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const VARIANTS = ['hierarchical', 'edge', 'container', 'serverless'];
const TEST_DIR = path.join(__dirname, '..', 'test-variants');
const SWITCH_SCRIPT = path.join(__dirname, 'switch-variant.js');

// Ensure test directory exists
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

console.log('\n=== Starting variant switching test ===');
console.log(`Test directory: ${TEST_DIR}\n`);

// Test each variant
let allTestsPassed = true;

for (const variant of VARIANTS) {
  console.log(`\n=== Testing ${variant.toUpperCase()} variant ===`);
  
  const variantDir = path.join(TEST_DIR, variant);
  
  try {
    // Clean up any previous test directory
    if (fs.existsSync(variantDir)) {
      fs.rmSync(variantDir, { recursive: true, force: true });
    }
    fs.mkdirSync(variantDir, { recursive: true });
    
    // Run the switch-variant script
    console.log(`Switching to ${variant} variant...`);
    execSync(`node ${SWITCH_SCRIPT} ${variant} --output-dir ${variantDir} --validate-only`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // Verify the generated files
    console.log('Verifying generated files...');
    const requiredFiles = [
      'variables.tf',
      'main.tf',
      'outputs.tf',
      'variables.auto.tfvars.json',
      'terraform.tfvars.json'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(variantDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing required file: ${filePath}`);
      }
      console.log(`✓ ${file} exists`);
    }
    
    // Validate the generated Terraform configuration
    console.log('Validating Terraform configuration...');
    execSync('terraform init && terraform validate', {
      stdio: 'inherit',
      cwd: variantDir
    });
    
    console.log(`✅ ${variant} variant test passed\n`);
    
  } catch (error) {
    console.error(`❌ ${variant} variant test failed: ${error.message}`);
    allTestsPassed = false;
  }
}

// Print summary
console.log('\n=== Test Summary ===');
if (allTestsPassed) {
  console.log('✅ All variant tests passed!');
  process.exit(0);
} else {
  console.error('❌ Some variant tests failed.');
  process.exit(1);
}
