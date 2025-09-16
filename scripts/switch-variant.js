#!/usr/bin/env node

/**
 * Switch Variant Script
 * 
 * This script manages the deployment variants by:
 * 1. Loading the specified variant configuration
 * 2. Generating necessary Terraform variables
 * 3. Updating deployment tags and metadata
 * 4. Outputting the selected configuration
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { execSync } = require('child_process');

// Configure command line options
program
  .name('switch-variant')
  .description('Switch between different deployment variants')
  .argument('<variant>', 'The variant to switch to (hierarchical, edge, container, serverless)')
  .option('--output <dir>', 'Output directory for generated files', 'deploy')
  .option('--validate-only', 'Only validate the configuration without applying', false)
  .option('--var <vars...>', 'Additional Terraform variables (key=value)')
  .action(async (variant, options) => {
    try {
      console.log(chalk.blue(`\n🔄 Switching to variant: ${chalk.bold(variant)}`));
      
      // 1. Load variant configuration
      const variantConfig = loadVariantConfig(variant);
      
      // 2. Create output directory if it doesn't exist
      ensureOutputDirectory(options.output);
      
      // 3. Generate Terraform variables
      const tfVars = generateTerraformVars(variantConfig, options.var || []);
      
      // 4. Write variables to file
      const varsFile = writeVarsFile(variant, tfVars, options.output);
      
      // 5. Update deployment metadata
      updateDeploymentMetadata(variant, variantConfig);
      
      console.log(chalk.green(`\n✅ Successfully switched to variant: ${chalk.bold(variant)}`));
      console.log(`\nNext steps:
  1. Review the generated configuration in ${chalk.cyan(varsFile)}
  2. Apply the changes with Terraform:
     ${chalk.cyan(`terraform apply -var-file=${varsFile}`)}`);
      
      if (!options.validateOnly) {
        console.log(chalk.yellow('\n⚠️  Run with --validate-only to skip applying changes'));
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Load and validate variant configuration
 */
function loadVariantConfig(variant) {
  const configPath = path.join(process.cwd(), 'config-variants', `${variant}.json`);
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Variant '${variant}' not found. Available variants: ${getAvailableVariants().join(', ')}`);
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    validateVariantConfig(config);
    return config;
  } catch (error) {
    throw new Error(`Failed to load variant config: ${error.message}`);
  }
}

/**
 * Get list of available variants
 */
function getAvailableVariants() {
  const variantsDir = path.join(process.cwd(), 'config-variants');
  if (!fs.existsSync(variantsDir)) {
    return [];
  }
  
  return fs.readdirSync(variantsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace(/\.json$/, ''));
}

/**
 * Validate variant configuration
 */
function validateVariantConfig(config) {
  const requiredFields = ['name', 'deployment', 'storage'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields in variant config: ${missingFields.join(', ')}`);
  }
  
  // Add additional validation as needed
  if (!['kubernetes', 'serverless', 'ecs', 'ec2'].includes(config.deployment?.type)) {
    throw new Error(`Unsupported deployment type: ${config.deployment?.type}`);
  }
}

/**
 * Ensure output directory exists
 */
function ensureOutputDirectory(outputDir) {
  const fullPath = path.join(process.cwd(), outputDir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

/**
 * Generate Terraform variables from variant config
 */
function generateTerraformVars(config, extraVars = []) {
  // Start with base variables
  const vars = {
    environment: config.tags?.environment || 'production',
    deployment_variant: config.name,
    
    // Deployment settings
    instance_type: config.deployment?.instance_type || 't3.medium',
    min_size: config.deployment?.min_instances || 1,
    max_size: config.deployment?.max_instances || 3,
    
    // Storage settings
    storage_type: config.storage.primary,
    storage_replicas: config.storage.replicas || 1,
    
    // Cache settings
    cache_enabled: config.cache?.enabled || false,
    cache_type: config.cache?.type || 'redis',
    
    // Tags
    tags: {
      ...config.tags,
      managed_by: 'terraform',
      last_updated: new Date().toISOString()
    }
  };
  
  // Add extra variables from command line
  extraVars.forEach(v => {
    const [key, value] = v.split('=');
    if (key && value) {
      vars[key] = value;
    }
  });
  
  return vars;
}

/**
 * Write variables to tfvars file
 */
function writeVarsFile(variant, vars, outputDir) {
  const fileName = `${variant}.auto.tfvars.json`;
  const filePath = path.join(process.cwd(), outputDir, fileName);
  
  fs.writeFileSync(
    filePath,
    JSON.stringify(vars, null, 2) + '\n',
    'utf8'
  );
  
  return filePath;
}

/**
 * Update deployment metadata
 */
function updateDeploymentMetadata(variant, config) {
  const metadata = {
    current_variant: variant,
    last_updated: new Date().toISOString(),
    config: {
      name: config.name,
      description: config.description,
      deployment_type: config.deployment.type,
      storage: config.storage.primary,
      cache: config.cache?.enabled ? config.cache.type : 'disabled'
    }
  };
  
  const metadataPath = path.join(process.cwd(), 'deploy', 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
  
  // Update git tag if in a git repository
  try {
    execSync(`git tag -f current-variant-${variant}`, { stdio: 'ignore' });
  } catch (error) {
    // Not a git repo or other git error - not critical
  }
}

// Run the program
program.parse(process.argv);
