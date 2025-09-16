#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { v4: uuidv4 } = require('uuid');
const { mean, std, median, min, max } = require('mathjs');
const { performance } = require('perf_hooks');
const cliProgress = require('cli-progress');

// Command line options
program
  .arguments('<files...>')
  .option('--group-by <fields>', 'Comma-separated list of fields to group by', 'storage_source')
  .option('--metrics <metrics>', 'Comma-separated list of metrics to analyze', 'latency_ms,throughput_rps,error_rate')
  .option('--ci-level <level>', 'Confidence level (0-1)', parseFloat, 0.95)
  .option('--bootstrap-samples <count>', 'Number of bootstrap samples', parseInt, 1000)
  .option('--output <file>', 'Output file path', 'results/analysis-report.json')
  .option('--seed <number>', 'Random seed for reproducibility', parseInt)
  .option('--verbose', 'Show detailed progress and information', false);

program.parse(process.argv);
const options = program.opts();
const files = program.args;

// Set random seed if provided
if (options.seed) {
  const seedrandom = require('seedrandom');
  seedrandom(options.seed, { global: true });
}

// Validate confidence level
if (options.ciLevel <= 0 || options.ciLevel >= 1) {
  console.error('Error: --ci-level must be between 0 and 1 (exclusive)');
  process.exit(1);
}

// Parse comma-separated options
const groupByFields = options.groupBy.split(',').map(f => f.trim());
const metrics = options.metrics.split(',').map(m => m.trim());

// Progress bar
const progressBar = new cliProgress.SingleBar({
  format: 'Analyzing... |{bar}| {percentage}% | {value}/{total} files',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

// Statistics functions
function calculatePercentiles(data, percentiles = [0.5, 0.95, 0.99]) {
  if (!data || data.length === 0) return {};
  
  const sorted = [...data].sort((a, b) => a - b);
  const result = {};
  
  for (const p of percentiles) {
    const key = `p${Math.round(p * 100)}`;
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    
    if (sorted[base + 1] !== undefined) {
      result[key] = sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
      result[key] = sorted[base];
    }
  }
  
  return result;
}

function bootstrapCI(data, statFn, { samples = 1000, ciLevel = 0.95 } = {}) {
  if (!data || data.length < 2) return { lower: null, upper: null };
  
  const alpha = (1 - ciLevel) / 2;
  const n = data.length;
  const stats = [];
  
  // Generate bootstrap samples
  for (let i = 0; i < samples; i++) {
    const sample = [];
    for (let j = 0; j < n; j++) {
      sample.push(data[Math.floor(Math.random() * n)]);
    }
    stats.push(statFn(sample));
  }
  
  // Calculate confidence interval
  stats.sort((a, b) => a - b);
  const lowerIdx = Math.floor(alpha * samples);
  const upperIdx = Math.ceil((1 - alpha) * samples) - 1;
  
  return {
    lower: stats[Math.max(0, lowerIdx)],
    upper: stats[Math.min(samples - 1, upperIdx)]
  };
}

// Process files
async function processFiles(filePatterns) {
  const fileList = [];
  
  // Expand file patterns
  for (const pattern of filePatterns) {
    if (fs.existsSync(pattern)) {
      const stat = fs.statSync(pattern);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(pattern)
          .filter(f => f.endsWith('.json') || f.endsWith('.parquet'))
          .map(f => path.join(pattern, f));
        fileList.push(...files);
      } else {
        fileList.push(pattern);
      }
    } else if (pattern.includes('*')) {
      const glob = require('glob');
      const files = glob.sync(pattern);
      fileList.push(...files);
    } else {
      console.warn(`Warning: File not found: ${pattern}`);
    }
  }
  
  if (fileList.length === 0) {
    console.error('Error: No valid input files found');
    process.exit(1);
  }
  
  // Process each file
  const results = [];
  const errors = [];
  
  if (options.verbose) {
    console.log(`Processing ${fileList.length} files...`);
    progressBar.start(fileList.length, 0);
  }
  
  for (const [index, file] of fileList.entries()) {
    try {
      if (options.verbose) {
        progressBar.update(index + 1, { file });
      }
      
      if (file.endsWith('.parquet')) {
        // Handle Parquet files
        const parquet = require('parquetjs');
        const reader = await parquet.ParquetReader.openFile(file);
        const cursor = reader.getCursor();
        
        let record;
        while (record = await cursor.next()) {
          results.push(record);
        }
        
        await reader.close();
      } else {
        // Handle JSON files
        const content = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(content);
        
        if (Array.isArray(data)) {
          results.push(...data);
        } else {
          results.push(data);
        }
      }
    } catch (error) {
      errors.push({
        file,
        error: error.message
      });
      if (options.verbose) {
        console.error(`\nError processing ${file}:`, error.message);
      }
    }
  }
  
  if (options.verbose) {
    progressBar.stop();
    console.log(`Processed ${results.length} records with ${errors.length} errors`);
  }
  
  return { results, errors };
}

// Main function
async function main() {
  const startTime = performance.now();
  const analysisId = `analysis_${Date.now()}`;
  
  // Process input files
  const { results, errors } = await processFiles(files);
  
  if (results.length === 0) {
    console.error('Error: No valid data to analyze');
    process.exit(1);
  }
  
  // Group data
  const groups = new Map();
  
  for (const record of results) {
    // Skip records without required metrics
    const hasAllMetrics = metrics.every(m => {
      const value = m.split('.').reduce((obj, key) => obj && obj[key], record);
      return typeof value === 'number' && isFinite(value);
    });
    
    if (!hasAllMetrics) continue;
    
    // Create group key
    const groupKey = groupByFields
      .map(field => {
        const value = field.split('.').reduce((obj, key) => obj && obj[key], record);
        return `${field}=${value !== undefined ? value : 'null'}`;
      })
      .join('|');
    
    // Initialize group if it doesn't exist
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupValues: {},
        metrics: {}
      });
      
      // Store group values
      for (const field of groupByFields) {
        const value = field.split('.').reduce((obj, key) => obj && obj[key], record);
        groups.get(groupKey).groupValues[field] = value !== undefined ? value : null;
      }
      
      // Initialize metrics
      for (const metric of metrics) {
        groups.get(groupKey).metrics[metric] = [];
      }
    }
    
    // Add metrics to group
    const group = groups.get(groupKey);
    for (const metric of metrics) {
      const value = metric.split('.').reduce((obj, key) => obj && obj[key], record);
      if (typeof value === 'number' && isFinite(value)) {
        group.metrics[metric].push(value);
      }
    }
  }
  
  // Calculate statistics for each group
  const analysisResults = [];
  
  for (const [key, group] of groups.entries()) {
    const stats = {
      group_values: group.groupValues,
      count: group.metrics[metrics[0]]?.length || 0,
      statistics: {}
    };
    
    for (const metric of metrics) {
      const values = group.metrics[metric];
      if (!values || values.length === 0) continue;
      
      // Basic statistics
      const m = mean(values);
      const s = std(values, 'uncorrected');
      const med = median(values);
      const mn = min(values);
      const mx = max(values);
      
      // Percentiles
      const percentiles = calculatePercentiles(values);
      
      // Confidence intervals
      const ci = bootstrapCI(
        values, 
        x => mean(x), 
        { samples: options.bootstrapSamples, ciLevel: options.ciLevel }
      );
      
      stats.statistics[metric] = {
        mean: m,
        std: s,
        min: mn,
        max: mx,
        median: med,
        ...percentiles,
        ci_lower: ci.lower,
        ci_upper: ci.upper,
        ci_level: options.ciLevel
      };
    }
    
    analysisResults.push(stats);
  }
  
  // Generate report
  const report = {
    analysis_id: analysisId,
    timestamp: new Date().toISOString(),
    analysis_type: 'descriptive',
    input_files: files,
    group_by: groupByFields,
    metrics: metrics,
    groups: analysisResults,
    metadata: {
      ci_method: 'bootstrap',
      bootstrap_samples: options.bootstrapSamples,
      alpha: 1 - options.ciLevel,
      software_version: '1.0.0',
      processing_time_ms: Math.round(performance.now() - startTime)
    },
    warnings: errors.map(e => `Error processing ${e.file}: ${e.error}`),
    version: '1.0.0'
  };
  
  // Validate report against schema
  const ajv = new Ajv();
  addFormats(ajv);
  const schema = require('../schemas/analysis-schema.json');
  const validate = ajv.compile(schema);
  const valid = validate(report);
  
  if (!valid) {
    console.error('Error: Generated report is invalid:');
    console.error(validate.errors);
    process.exit(1);
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(options.output);
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true, mode: 0o777 });
    }
    
    // Save report
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
    console.log(`Analysis complete. Report saved to ${options.output}`);
  } catch (error) {
    console.error(`Failed to write to ${options.output}:`, error.message);
    console.error('Current working directory:', process.cwd());
    console.error('Attempting to write to absolute path...');
    
    // Try with absolute path
    const absolutePath = path.resolve(options.output);
    const absoluteDir = path.dirname(absolutePath);
    
    try {
      if (!fs.existsSync(absoluteDir)) {
        fs.mkdirSync(absoluteDir, { recursive: true, mode: 0o777 });
      }
      
      fs.writeFileSync(absolutePath, JSON.stringify(report, null, 2));
      console.log(`Report saved to absolute path: ${absolutePath}`);
    } catch (absError) {
      console.error('Failed to write to absolute path:', absError.message);
      console.error('Saving to current directory instead...');
      
      // Last resort: save to current directory
      const fallbackFile = path.basename(options.output);
      fs.writeFileSync(fallbackFile, JSON.stringify(report, null, 2));
      console.log(`Report saved to current directory as: ${fallbackFile}`);
    }
  }
  
  // Print summary
  console.log('\nSummary Statistics:');
  console.log('------------------');
  
  for (const group of analysisResults) {
    console.log(`\nGroup: ${JSON.stringify(group.group_values, null, 2)}`);
    console.log(`Samples: ${group.count}`);
    
    for (const [metric, stats] of Object.entries(group.statistics)) {
      console.log(`\n${metric}:`);
      console.log(`  Mean: ${stats.mean.toFixed(4)}`);
      console.log(`  Std: ${stats.std.toFixed(4)}`);
      console.log(`  Min: ${stats.min.toFixed(4)}`);
      console.log(`  Max: ${stats.max.toFixed(4)}`);
      console.log(`  Median: ${stats.median.toFixed(4)}`);
      console.log(`  p95: ${stats.p95.toFixed(4)}`);
      console.log(`  p99: ${stats.p99.toFixed(4)}`);
      console.log(`  ${options.ciLevel * 100}% CI: [${stats.ci_lower.toFixed(4)}, ${stats.ci_upper.toFixed(4)}]`);
    }
  }
  
  if (errors.length > 0) {
    console.log(`\nWarnings (${errors.length}):`);
    for (const error of errors) {
      console.log(`- ${error.file}: ${error.error}`);
    }
  }
}

// Run the analysis
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
