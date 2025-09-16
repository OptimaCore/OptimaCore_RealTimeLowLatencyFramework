#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { v4: uuidv4 } = require('uuid');
const scenariosConfig = require('../../config/scenarios.json');
const { promisify } = require('util');
const mkdirp = require('mkdirp');

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// Ensure output directory exists
const ensureDir = async (dir) => {
  await mkdirp(dir);
};

// Generate a unique run ID for this test
const generateRunId = () => {
  return `run_${Date.now()}_${uuidv4().substring(0, 8)}`;
};

// Apply chaos configuration to a phase
const applyChaosConfig = (phase, config) => {
  if (!config || !phase.chaos) return phase;
  
  const chaos = phase.chaos;
  const processors = [];
  
  if (chaos.networkLatency?.enabled) {
    processors.push({
      name: 'chaos',
      config: {
        type: 'latency',
        minDelay: chaos.networkLatency.minDelay || 1000,
        maxDelay: chaos.networkLatency.maxDelay || 3000,
        errorRate: chaos.networkLatency.errorRate || 0.1
      }
    });
  }
  
  if (chaos.errorInjection?.enabled) {
    processors.push({
      name: 'chaos',
      config: {
        type: 'error',
        statusCodes: chaos.errorInjection.statusCodes || [500, 502, 503, 504],
        errorRate: chaos.errorInjection.errorRate || 0.1
      }
    });
  }
  
  if (processors.length > 0) {
    return {
      ...phase,
      beforeScenario: 'chaosBeforeScenario',
      afterResponse: 'chaosAfterResponse',
      processor: { chaos: processors }
    };
  }
  
  return phase;
};

// Generate Artillery scenario from configuration
const generateArtilleryScenario = (scenarioName, config, environment = 'local', format = 'yaml') => {
  const scenarioConfig = scenariosConfig.scenarios[scenarioName];
  if (!scenarioConfig) {
    throw new Error(`Scenario '${scenarioName}' not found in configuration`);
  }

  const envConfig = scenariosConfig.environments[environment] || {};
  const runId = generateRunId();
  const timestamp = new Date().toISOString();

  // Base configuration
  const artilleryConfig = {
    config: {
      target: envConfig.target || scenariosConfig.defaults.target,
      phases: scenarioConfig.phases.map(phase => ({
        ...phase,
        ...(phase.chaos ? applyChaosConfig(phase, phase.chaos) : {})
      })),
      defaults: {
        ...scenariosConfig.defaults,
        ...scenarioConfig.defaults,
        headers: {
          ...(scenariosConfig.defaults.headers || {}),
          ...(envConfig.headers || {}),
          ...(scenarioConfig.defaults?.headers || {}),
          'X-Test-Run-Id': runId,
          'X-Test-Start-Time': timestamp,
          'X-Test-Scenario': scenarioName,
          'X-Test-Environment': environment
        }
      }
    },
    scenarios: []
  };

  // Add scenarios
  if (scenarioConfig.scenarios) {
    artilleryConfig.scenarios = scenarioConfig.scenarios.map((scenario, index) => ({
      ...scenario,
      name: `${scenarioName}-${scenario.name || `scenario-${index + 1}`}`,
      flow: scenario.flow || []
    }));
  }

  // Add multi-region support if specified
  if (scenarioConfig.regions) {
    artilleryConfig.config.regions = scenarioConfig.regions;
  }

  // Add chaos processor if needed
  if (scenarioConfig.phases.some(phase => phase.chaos)) {
    artilleryConfig.config.processor = artilleryConfig.config.processor || {};
    artilleryConfig.config.processor.chaos = `./chaos-processor.js`;
  }

  return format === 'json' 
    ? JSON.stringify(artilleryConfig, null, 2)
    : require('js-yaml').dump(artilleryConfig);
};

// Generate K6 scenario from configuration
const generateK6Scenario = (scenarioName, config, environment = 'local') => {
  const scenarioConfig = scenariosConfig.scenarios[scenarioName];
  if (!scenarioConfig) {
    throw new Error(`Scenario '${scenarioName}' not found in configuration`);
  }

  const envConfig = scenariosConfig.environments[environment] || {};
  const runId = generateRunId();
  const timestamp = new Date().toISOString();

  // Base imports and configuration
  let k6Script = `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Configuration
const BASE_URL = '${envConfig.target || scenariosConfig.defaults.target}';
const RUN_ID = '${runId}';
const SCENARIO = '${scenarioName}';
const ENVIRONMENT = '${environment}';

// Custom metrics
const errorRate = new Rate('errors');

// Common headers
const commonHeaders = ${JSON.stringify({
    ...(scenariosConfig.defaults.headers || {}),
    ...(envConfig.headers || {}),
    ...(scenarioConfig.defaults?.headers || {}),
    'X-Test-Run-Id': runId,
    'X-Test-Start-Time': timestamp,
    'X-Test-Scenario': scenarioName,
    'X-Test-Environment': environment,
    'Content-Type': 'application/json'
  }, null, 2)};

// Helper functions
function makeRequest(method, url, body = null, params = {}) {
  const requestParams = {
    headers: { ...commonHeaders, ...(params.headers || {}) },
    tags: { name: url },
    ...params
  };

  let response;
  const fullUrl = url.startsWith('http') ? url : \`\${BASE_URL}\${url}\`;
  
  switch (method.toLowerCase()) {
    case 'get':
      response = http.get(fullUrl, requestParams);
      break;
    case 'post':
      response = http.post(fullUrl, JSON.stringify(body), requestParams);
      break;
    case 'put':
      response = http.put(fullUrl, JSON.stringify(body), requestParams);
      break;
    case 'delete':
      response = http.del(fullUrl, null, requestParams);
      break;
    default:
      throw new Error(\`Unsupported HTTP method: \${method}\`);
  }

  // Record success/failure
  const isOk = response.status >= 200 && response.status < 300;
  errorRate.add(!isOk);
  
  return response;
}

// Scenario implementations\n\n`;

  // Add scenario functions
  scenarioConfig.scenarios.forEach((scenario, index) => {
    const scenarioName = scenario.name || `scenario_${index + 1}`;
    k6Script += `// ${scenario.description || ''}
function ${scenarioName}() {\n`;

    // Add flow steps
    scenario.flow.forEach((step, stepIndex) => {
      if (step.think) {
        k6Script += `  sleep(${step.think});\n`;
        return;
      }

      const method = Object.keys(step)[0];
      const config = step[method];
      const url = config.url.replace(/\{\{.*?\}\}/g, (match) => {
        // Simple template replacement for k6
        const varName = match.match(/\{\{\s*(.*?)\s*\}\}/)[1];
        if (varName.includes('randomInt')) {
          const [_, min, max] = varName.match(/randomInt\((\d+),\s*(\d+)\)/);
          return `\${Math.floor(Math.random() * (${max} - ${min} + 1) + ${min})}`;
        }
        return `\${${varName}}`;
      });

      k6Script += `  // ${method.toUpperCase()} ${url}\n`;
      k6Script += `  const response${stepIndex} = makeRequest('${method}', \`${url}\`${
        config.json ? ', ' + JSON.stringify(config.json) : ''
      });\n`;
      k6Script += `  check(response${stepIndex}, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });\n\n`;
    });

    k6Script += `}\n\n`;
  });

  // Add scenario execution
  k6Script += `// Main function
export default function () {\n`;

  // Add scenario selection based on weights
  if (scenarioConfig.scenarios.length > 1) {
    k6Script += '  const rand = Math.random();\n';
    const totalWeight = scenarioConfig.scenarios.reduce((sum, s) => sum + (s.weight || 1), 0);
    let currentWeight = 0;

    scenarioConfig.scenarios.forEach((scenario, index) => {
      const scenarioName = scenario.name || `scenario_${index + 1}`;
      const weight = scenario.weight || 1;
      const threshold = currentWeight + weight / totalWeight;
      const condition = index === 0
        ? `if (rand < ${threshold})`
        : `else if (rand < ${threshold})`;
      
      k6Script += `  ${condition} {\n    ${scenarioName}();\n  }\n`;
      currentWeight = threshold;
    });
    
    // Close the final else
    if (scenarioConfig.scenarios.length > 0) {
      const lastScenario = scenarioConfig.scenarios[scenarioConfig.scenarios.length - 1];
      const scenarioName = lastScenario.name || `scenario_${scenarioConfig.scenarios.length}`;
      k6Script += `  else {\n    ${scenarioName}();\n  }\n`;
    }
  } else if (scenarioConfig.scenarios.length === 1) {
    const scenarioName = scenarioConfig.scenarios[0].name || 'scenario_1';
    k6Script += `  ${scenarioName}();\n`;
  }

  k6Script += `}

// Options
export const options = {\n  scenarios: {\n`;

  // Add phases as scenarios
  scenarioConfig.phases.forEach((phase, index) => {
    k6Script += `    phase_${index}: {\n      executor: 'ramping-vus',\n      startVUs: ${phase.arrivalRate || 1},\n      stages: [\n        { target: ${phase.rampTo || phase.arrivalRate || 1}, duration: '${phase.duration}s' }\n      ],\n      gracefulRampDown: '30s',\n      tags: { phase: '${phase.name || `phase_${index}`}' }\n    },\n`;
  });

  k6Script += `  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.1'],
  },
};
`;

  return k6Script;
};

// Main function
const main = async () => {
  program
    .name('scenario-generator')
    .description('Generate load test scenarios from configuration')
    .requiredOption('-s, --scenario <name>', 'Name of the scenario to generate')
    .option('-o, --out <directory>', 'Output directory', './')
    .option('-f, --format <format>', 'Output format (json, yaml, k6)', 'yaml')
    .option('-e, --env <environment>', 'Target environment (local, staging, production)', 'local')
    .option('--list', 'List available scenarios')
    .parse(process.argv);

  const options = program.opts();

  if (options.list) {
    console.log('Available scenarios:');
    Object.entries(scenariosConfig.scenarios).forEach(([name, config]) => {
      console.log(`\n${name}: ${config.description || 'No description'}`);
      console.log(`  Phases: ${config.phases.map(p => p.name).join(', ')}`);
      console.log(`  Scenarios: ${config.scenarios.map(s => s.name).join(', ')}`);
    });
    process.exit(0);
  }

  try {
    const { scenario, out, format, env } = options;
    const outputDir = path.resolve(process.cwd(), out);
    
    // Ensure output directory exists
    await ensureDir(outputDir);

    // Generate the scenario
    let content, extension;
    if (format.toLowerCase() === 'k6') {
      content = generateK6Scenario(scenario, scenariosConfig, env);
      extension = 'js';
    } else {
      content = generateArtilleryScenario(scenario, scenariosConfig, env, format);
      extension = format.toLowerCase() === 'json' ? 'json' : 'yaml';
    }

    const outputFile = path.join(outputDir, `${scenario}.${extension}`);
    await writeFile(outputFile, content, 'utf8');
    
    console.log(`✅ Scenario '${scenario}' generated successfully at: ${outputFile}`);
    
    // If generating Artillery scenario, ensure processor is available
    if (format.toLowerCase() !== 'k6') {
      const processorFile = path.join(outputDir, 'chaos-processor.js');
      if (!fs.existsSync(processorFile)) {
        const processorContent = await readFile(
          path.join(__dirname, 'chaos-processor.js'),
          'utf8'
        ).catch(() => {
          console.warn('⚠️  chaos-processor.js not found. Some features may not work as expected.');
          return null;
        });
        
        if (processorContent) {
          await writeFile(processorFile, processorContent, 'utf8');
          console.log(`✅ Chaos processor copied to: ${processorFile}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error generating scenario:', error.message);
    process.exit(1);
  }
};

// Run the main function
if (require.main === module) {
  main();
}

module.exports = {
  generateArtilleryScenario,
  generateK6Scenario
};
