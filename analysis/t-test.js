#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { v4: uuidv4 } = require('uuid');
const { mean, std, sqrt } = require('mathjs');
const { performance } = require('perf_hooks');
const cliProgress = require('cli-progress');
const { loadData, groupData, calculateBasicStats } = require('./utils');

// Command line options
program
  .arguments('<files...>')
  .option('--group-by <field>', 'Field to group by for comparison', 'storage_source')
  .option('--metric <metric>', 'Metric to analyze', 'latency_ms')
  .option('--alpha <level>', 'Significance level (0-1)', parseFloat, 0.05)
  .option('--output <file>', 'Output file path', 'results/t-test-results.json')
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

// Validate alpha level
if (options.alpha <= 0 || options.alpha >= 1) {
  console.error('Error: --alpha must be between 0 and 1 (exclusive)');
  process.exit(1);
}

/**
 * Perform a two-sample t-test
 * @param {number[]} x First sample
 * @param {number[]} y Second sample
 * @param {Object} options Options
 * @returns {Object} Test results
 */
function ttest(x, y, { alpha = 0.05, equalVariance = false } = {}) {
  // Basic statistics
  const n1 = x.length;
  const n2 = y.length;
  const m1 = mean(x);
  const m2 = mean(y);
  const v1 = std(x, 'uncorrected') ** 2;
  const v2 = std(y, 'uncorrected') ** 2;
  
  // Calculate standard error and degrees of freedom
  let se, df;
  
  if (equalVariance) {
    // Pooled standard error
    const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    se = sqrt(pooledVar * (1 / n1 + 1 / n2));
    df = n1 + n2 - 2;
  } else {
    // Welch's t-test (unequal variances)
    se = sqrt(v1 / n1 + v2 / n2);
    
    // Welch-Satterthwaite equation for degrees of freedom
    const num = (v1 / n1 + v2 / n2) ** 2;
    const denom = (v1 ** 2) / (n1 ** 2 * (n1 - 1)) + (v2 ** 2) / (n2 ** 2 * (n2 - 1));
    df = num / denom;
  }
  
  // Test statistic
  const t = (m1 - m2) / se;
  
  // Two-tailed p-value
  const tdist = require('@stdlib/stats-base-dists-t');
  let pValue;
  
  if (t >= 0) {
    pValue = 2 * (1 - tdist.cdf(Math.abs(t), df));
  } else {
    pValue = 2 * tdist.cdf(-Math.abs(t), df);
  }
  
  // Effect size (Cohen's d)
  const pooledStd = equalVariance 
    ? sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
    : sqrt((v1 + v2) / 2);
  
  const cohensD = (m1 - m2) / pooledStd;
  
  // Confidence interval for the mean difference
  const tCritical = tdist.quantile(1 - alpha / 2, df);
  const marginOfError = tCritical * se;
  const ciLower = (m1 - m2) - marginOfError;
  const ciUpper = (m1 - m2) + marginOfError;
  
  return {
    t,
    df,
    pValue,
    cohensD,
    m1,
    m2,
    n1,
    n2,
    ciLower,
    ciUpper,
    ciLevel: 1 - alpha,
    significant: pValue < alpha,
    equalVariance,
    alpha
  };
}

// Main function
async function main() {
  const startTime = performance.now();
  const analysisId = `ttest_${Date.now()}`;
  
  // Load and process data
  const { results, errors } = await loadData(files, options.verbose);
  
  if (results.length === 0) {
    console.error('Error: No valid data to analyze');
    process.exit(1);
  }
  
  // Group data
  const groups = groupData(results, [options.groupBy], [options.metric]);
  const groupKeys = Array.from(groups.keys());
  
  if (groupKeys.length < 2) {
    console.error(`Error: Need at least 2 groups to compare. Found: ${groupKeys.length}`);
    process.exit(1);
  }
  
  // Perform all pairwise comparisons
  const comparisons = [];
  
  for (let i = 0; i < groupKeys.length; i++) {
    for (let j = i + 1; j < groupKeys.length; j++) {
      const group1 = groups.get(groupKeys[i]);
      const group2 = groups.get(groupKeys[j]);
      
      const values1 = group1.metrics[options.metric];
      const values2 = group2.metrics[options.metric];
      
      // Skip if not enough data
      if (values1.length < 2 || values2.length < 2) {
        console.warn(`Warning: Not enough data to compare ${groupKeys[i]} (n=${values1.length}) and ${groupKeys[j]} (n=${values2.length})`);
        continue;
      }
      
      // Perform t-test
      const result = ttest(values1, values2, { 
        alpha: options.alpha,
        equalVariance: false // Use Welch's t-test by default
      });
      
      comparisons.push({
        groups: [
          { [options.groupBy]: group1.groupValues[options.groupBy] },
          { [options.groupBy]: group2.groupValues[options.groupBy] }
        ],
        metric: options.metric,
        test_type: 't_test',
        statistic: result.t,
        df: result.df,
        p_value: result.pValue,
        effect_size: result.cohensD,
        ci_lower: result.ciLower,
        ci_upper: result.ciUpper,
        ci_level: result.ciLevel,
        significance: result.significant,
        group1_mean: result.m1,
        group2_mean: result.m2,
        group1_n: result.n1,
        group2_n: result.n2
      });
    }
  }
  
  if (comparisons.length === 0) {
    console.error('Error: No valid comparisons could be made');
    process.exit(1);
  }
  
  // Generate report
  const report = {
    analysis_id: analysisId,
    timestamp: new Date().toISOString(),
    analysis_type: 't_test',
    input_files: files,
    group_by: options.groupBy,
    metric: options.metric,
    comparisons: comparisons,
    metadata: {
      alpha: options.alpha,
      test: "Welch's t-test (unequal variances)",
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
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save report
  fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
  console.log(`Analysis complete. Results saved to ${options.output}`);
  
  // Print summary
  console.log('\nT-Test Results:');
  console.log('------------------');
  console.log(`Metric: ${options.metric}`);
  console.log(`Significance level: α = ${options.alpha}`);
  console.log(`Groups compared: ${groupKeys.join(', ')}`);
  
  for (const comp of comparisons) {
    const group1 = comp.groups[0][options.groupBy];
    const group2 = comp.groups[1][options.groupBy];
    const mean1 = comp.group1_mean.toFixed(4);
    const mean2 = comp.group2_mean.toFixed(4);
    const p = comp.p_value.toExponential(3);
    const d = comp.effect_size.toFixed(2);
    const sig = comp.significance ? 'YES' : 'no';
    
    console.log(`\n${group1} (n=${comp.group1_n}, M=${mean1}) vs ${group2} (n=${comp.group2_n}, M=${mean2}):`);
    console.log(`  t(${comp.df.toFixed(2)}) = ${comp.statistic.toFixed(4)}, p = ${p}`);
    console.log(`  Cohen's d = ${d}, 95% CI [${comp.ci_lower.toFixed(4)}, ${comp.ci_upper.toFixed(4)}]`);
    console.log(`  Significant at α = ${options.alpha}? ${sig}`);
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
