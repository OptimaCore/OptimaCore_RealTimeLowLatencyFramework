#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');
const { program } = require('commander');

// Schema for scenario validation
const scenarioSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          duration: { type: 'number', minimum: 1 },
          arrivalRate: { type: 'number', minimum: 0 },
          rampTo: { type: 'number', minimum: 0 },
          chaos: {
            type: 'object',
            properties: {
              networkLatency: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  minDelay: { type: 'number', minimum: 0 },
                  maxDelay: { type: 'number', minimum: 0 },
                  errorRate: { type: 'number', minimum: 0, maximum: 1 }
                },
                required: ['enabled']
              },
              errorInjection: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  errorRate: { type: 'number', minimum: 0, maximum: 1 },
                  statusCodes: {
                    type: 'array',
                    items: { type: 'number', minimum: 100, maximum: 599 }
                  }
                },
                required: ['enabled']
              }
            }
          }
        },
        required: ['name', 'duration', 'arrivalRate']
      }
    },
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          weight: { type: 'number', minimum: 0 },
          flow: {
            type: 'array',
            items: {
              type: 'object',
              oneOf: [
                {
                  properties: {
                    think: { type: 'number', minimum: 0 }
                  },
                  required: ['think']
                },
                {
                  properties: {
                    get: { type: 'object' },
                    post: { type: 'object' },
                    put: { type: 'object' },
                    delete: { type: 'object' }
                  },
                  required: ['get', 'post', 'put', 'delete'].filter(Boolean)
                }
              ]
            }
          }
        },
        required: ['name', 'flow']
      }
    },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          weight: { type: 'number', minimum: 0 }
        },
        required: ['name', 'weight']
      }
    },
    defaults: {
      type: 'object',
      properties: {
        headers: { type: 'object' },
        timeout: { type: 'number', minimum: 0 },
        noConnectionReuse: { type: 'boolean' }
      }
    }
  },
  required: ['phases', 'scenarios']
};

// Schema for environments
const environmentSchema = {
  type: 'object',
  patternProperties: {
    '^.*$': {
      type: 'object',
      properties: {
        target: { type: 'string', format: 'uri' },
        headers: { type: 'object' }
      },
      required: ['target']
    }
  },
  required: ['local']
};

// Schema for the entire configuration
const configSchema = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'object',
      patternProperties: {
        '^.*$': scenarioSchema
      },
      minProperties: 1
    },
    environments: environmentSchema,
    defaults: {
      type: 'object',
      properties: {
        target: { type: 'string', format: 'uri' },
        headers: { type: 'object' },
        timeout: { type: 'number', minimum: 0 },
        noConnectionReuse: { type: 'boolean' }
      }
    }
  },
  required: ['scenarios', 'environments']
};

// Validate a scenario configuration
function validateScenario(scenarioName, scenario, ajv) {
  const valid = ajv.validate(scenarioSchema, scenario);
  if (!valid) {
    console.error(`❌ Invalid scenario '${scenarioName}':`);
    console.error(ajv.errorsText(ajv.errors, { separator: '\n' }));
    return false;
  }
  
  // Additional validation that can't be expressed in JSON Schema
  const errors = [];
  
  // Check that rampTo is greater than arrivalRate in ramp-up phases
  scenario.phases.forEach((phase, index) => {
    if (phase.rampTo !== undefined && phase.rampTo <= phase.arrivalRate) {
      errors.push(
        `Phase ${index} (${phase.name}): rampTo (${phase.rampTo}) must be greater than arrivalRate (${phase.arrivalRate})`
      );
    }
    
    // Check chaos configuration
    if (phase.chaos?.networkLatency?.enabled) {
      const { minDelay, maxDelay } = phase.chaos.networkLatency;
      if (minDelay > maxDelay) {
        errors.push(
          `Phase ${index} (${phase.name}): networkLatency.minDelay (${minDelay}) must be less than or equal to maxDelay (${maxDelay})`
        );
      }
    }
  });
  
  // Check scenario weights if provided
  const hasWeights = scenario.scenarios.some(s => s.weight !== undefined);
  if (hasWeights && scenario.scenarios.some(s => s.weight === undefined)) {
    errors.push('Either all scenarios must have weights or none should have them');
  }
  
  if (errors.length > 0) {
    console.error(`❌ Validation errors in scenario '${scenarioName}':`);
    errors.forEach(error => console.error(`  - ${error}`));
    return false;
  }
  
  return true;
}

// Validate the entire configuration
function validateConfig(config) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  // Validate the overall structure
  const valid = ajv.validate(configSchema, config);
  if (!valid) {
    console.error('❌ Invalid configuration:');
    console.error(ajv.errorsText(ajv.errors, { separator: '\n' }));
    return false;
  }
  
  // Validate each scenario
  let allValid = true;
  for (const [name, scenario] of Object.entries(config.scenarios)) {
    if (!validateScenario(name, scenario, ajv)) {
      allValid = false;
    } else {
      console.log(`✅ Scenario '${name}' is valid`);
    }
  }
  
  // Check that all referenced environments exist
  for (const [name, env] of Object.entries(config.environments)) {
    if (!env.target) {
      console.error(`❌ Environment '${name}' is missing required property 'target'`);
      allValid = false;
    }
  }
  
  return allValid;
}

// Main function
async function main() {
  program
    .name('validate-scenarios')
    .description('Validate scenario configurations')
    .argument('[file]', 'Path to scenarios.json', 'config/scenarios.json')
    .option('-v, --verbose', 'Enable verbose output', false)
    .parse(process.argv);
    
  const options = program.opts();
  const configFile = program.args[0];
  
  try {
    // Read and parse the configuration file
    const fileContent = fs.readFileSync(configFile, 'utf8');
    const config = configFile.endsWith('.json') 
      ? JSON.parse(fileContent)
      : yaml.load(fileContent);
    
    if (options.verbose) {
      console.log('Validating configuration...');
      console.log(`Found ${Object.keys(config.scenarios).length} scenarios`);
      console.log(`Found ${Object.keys(config.environments).length} environments`);
    }
    
    // Validate the configuration
    const isValid = validateConfig(config);
    
    if (isValid) {
      console.log('\n✅ All scenarios are valid!');
      process.exit(0);
    } else {
      console.error('\n❌ Validation failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error validating scenarios:', error.message);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  validateConfig,
  validateScenario
};
