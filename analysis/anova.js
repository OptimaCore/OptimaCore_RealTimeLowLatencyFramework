#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { v4: uuidv4 } = require('uuid');
const { mean, sum, variance } = require('mathjs');
const { performance } = require('perf_hooks');
const cliProgress = require('cli-progress');
const { loadData, groupData } = require('./utils');

// Command line options
program
  .arguments('<files...>')
  .option('--group-by <field>', 'Field to group by for comparison', 'storage_source')
  .option('--metric <metric>', 'Metric to analyze', 'latency_ms')
  .option('--alpha <level>', 'Significance level (0-1)', parseFloat, 0.05)
  .option('--post-hoc', 'Perform post-hoc tests', true)
  .option('--output <file>', 'Output file path', 'results/anova-results.json')
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
 * Perform one-way ANOVA
 * @param {Object} groups Object with group names as keys and arrays of values as values
 * @returns {Object} ANOVA results
 */
function oneWayAnova(groups) {
  const groupNames = Object.keys(groups);
  const k = groupNames.length;
  
  if (k < 2) {
    throw new Error('ANOVA requires at least 2 groups');
  }
  
  // Flatten all values and calculate overall mean
  const allValues = [];
  const nValues = [];
  const groupMeans = [];
  const groupVariances = [];
  
  for (const group of groupNames) {
    const values = groups[group];
    const n = values.length;
    
    if (n < 2) {
      throw new Error(`Group '${group}' has less than 2 values`);
    }
    
    allValues.push(...values);
    nValues.push(n);
    
    const m = mean(values);
    groupMeans.push(m);
    groupVariances.push(variance(values, 'uncorrected') * (n - 1)); // SS_within for this group
  }
  
  const N = allValues.length;
  const grandMean = mean(allValues);
  
  // Calculate sums of squares
  let SS_between = 0;
  for (let i = 0; i < k; i++) {
    SS_between += nValues[i] * Math.pow(groupMeans[i] - grandMean, 2);
  }
  
  const SS_within = sum(groupVariances);
  const SS_total = SS_between + SS_within;
  
  // Calculate degrees of freedom
  const df_between = k - 1;
  const df_within = N - k;
  const df_total = N - 1;
  
  // Calculate mean squares
  const MS_between = SS_between / df_between;
  const MS_within = SS_within / df_within;
  
  // Calculate F-statistic
  const F = MS_between / MS_within;
  
  // Calculate p-value
  const fdist = require('@stdlib/stats-base-dists-f');
  const pValue = 1 - fdist.cdf(F, df_between, df_within);
  
  // Calculate effect size (Eta squared)
  const etaSquared = SS_between / SS_total;
  
  return {
    SS_between,
    SS_within,
    SS_total,
    df_between,
    df_within,
    df_total,
    MS_between,
    MS_within,
    F,
    pValue,
    etaSquared,
    groupMeans,
    groupNames,
    nValues
  };
}

/**
 * Perform Tukey's HSD test for post-hoc comparisons
 * @param {Object} groups Object with group names as keys and arrays of values as values
 * @param {number} alpha Significance level
 * @returns {Array} Array of comparison results
 */
function tukeyHSD(groups, alpha = 0.05) {
  const groupNames = Object.keys(groups);
  const k = groupNames.length;
  const comparisons = [];
  
  if (k < 2) {
    return [];
  }
  
  // Calculate group statistics
  const groupStats = {};
  let N = 0;
  let df_within = 0;
  let MS_within = 0;
  
  // First pass: calculate group means and count
  for (const group of groupNames) {
    const values = groups[group];
    const n = values.length;
    const m = mean(values);
    const v = variance(values, 'uncorrected');
    
    groupStats[group] = {
      mean: m,
      n: n,
      variance: v
    };
    
    N += n;
    df_within += n - 1;
    MS_within += (n - 1) * v;
  }
  
  MS_within /= df_within;
  
  // Get critical value from studentized range distribution (q-distribution)
  const studentizedRange = require('@stdlib/stats-base-dists-studentized-range');
  const q = studentizedRange.quantile(1 - alpha, k, df_within);
  
  // Perform all pairwise comparisons
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const group1 = groupNames[i];
      const group2 = groupNames[j];
      const stats1 = groupStats[group1];
      const stats2 = groupStats[group2];
      
      const meanDiff = stats1.mean - stats2.mean;
      const n1 = stats1.n;
      const n2 = stats2.n;
      
      // Standard error for Tukey's HSD
      const se = Math.sqrt(MS_within * (1 / n1 + 1 / n2) / 2);
      
      // Critical difference
      const cd = q * se;
      
      // Test statistic
      const qStat = Math.abs(meanDiff) / se;
      
      // Adjusted p-value
      const pValue = 1 - studentizedRange.cdf(qStat, k, df_within);
      
      comparisons.push({
        group1,
        group2,
        meanDiff,
        se,
        q: qStat,
        pValue,
        significant: pValue < alpha,
        ciLower: meanDiff - cd,
        ciUpper: meanDiff + cd,
        ciLevel: 1 - alpha
      });
    }
  }
  
  return comparisons;
}

// Main function
async function main() {
  const startTime = performance.now();
  const analysisId = `anova_${Date.now()}`;
  
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
    console.error(`Error: Need at least 2 groups for ANOVA. Found: ${groupKeys.length}`);
    process.exit(1);
  }
  
  // Prepare data for ANOVA
  const anovaData = {};
  const groupInfo = [];
  
  for (const [key, group] of groups.entries()) {
    const values = group.metrics[options.metric];
    if (values && values.length >= 2) { // Need at least 2 values per group
      anovaData[key] = values;
      groupInfo.push({
        name: key,
        n: values.length,
        mean: mean(values),
        std: Math.sqrt(variance(values, 'uncorrected')),
        values: values
      });
    }
  }
  
  if (Object.keys(anovaData).length < 2) {
    console.error('Error: Not enough valid groups for ANOVA');
    process.exit(1);
  }
  
  // Perform one-way ANOVA
  const anovaResult = oneWayAnova(anovaData);
  
  // Perform post-hoc tests if requested and ANOVA is significant
  let postHoc = [];
  if (options.postHoc && anovaResult.pValue < options.alpha) {
    postHoc = tukeyHSD(anovaData, options.alpha);
  }
  
  // Generate report
  const report = {
    analysis_id: analysisId,
    timestamp: new Date().toISOString(),
    analysis_type: 'anova',
    input_files: files,
    group_by: options.groupBy,
    metric: options.metric,
    anova_results: {
      f_statistic: anovaResult.F,
      p_value: anovaResult.pValue,
      df_between: anovaResult.df_between,
      df_within: anovaResult.df_within,
      ss_between: anovaResult.SS_between,
      ss_within: anovaResult.SS_within,
      ms_between: anovaResult.MS_between,
      ms_within: anovaResult.MS_within,
      effect_size: anovaResult.etaSquared,
      significance: anovaResult.pValue < options.alpha,
      group_means: {},
      group_counts: {},
      post_hoc: postHoc.map(ph => ({
        group1: { [options.groupBy]: ph.group1 },
        group2: { [options.groupBy]: ph.group2 },
        mean_difference: ph.meanDiff,
        se: ph.se,
        q: ph.q,
        p_value: ph.pValue,
        ci_lower: ph.ciLower,
        ci_upper: ph.ciUpper,
        ci_level: ph.ciLevel,
        significant: ph.significant
      }))
    },
    metadata: {
      alpha: options.alpha,
      post_hoc_test: options.postHoc ? "Tukey's HSD" : "none",
      software_version: '1.0.0',
      processing_time_ms: Math.round(performance.now() - startTime)
    },
    warnings: errors.map(e => `Error processing ${e.file}: ${e.error}`),
    version: '1.0.0'
  };
  
  // Add group means and counts
  for (let i = 0; i < anovaResult.groupNames.length; i++) {
    const group = anovaResult.groupNames[i];
    report.anova_results.group_means[group] = anovaResult.groupMeans[i];
    report.anova_results.group_counts[group] = anovaResult.nValues[i];
  }
  
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
  console.log('\nOne-Way ANOVA Results:');
  console.log('------------------');
  console.log(`Dependent variable: ${options.metric}`);
  console.log(`Grouping variable: ${options.groupBy}`);
  console.log(`Significance level: α = ${options.alpha}`);
  console.log(`\nANOVA Summary:`);
  console.log('Source       |   SS      |   df  |   MS      |   F       |   p       | η²     ');
  console.log('-------------|-----------|-------|-----------|-----------|-----------|--------');
  console.log(`Between      | ${anovaResult.SS_between.toFixed(4).padStart(9)} | ${anovaResult.df_between.toString().padStart(5)} | ${anovaResult.MS_between.toFixed(4).padStart(9)} | ${anovaResult.F.toFixed(4).padStart(9)} | ${anovaResult.pValue.toExponential(3).padStart(9)} | ${anovaResult.etaSquared.toFixed(4)}`);
  console.log(`Within       | ${anovaResult.SS_within.toFixed(4).padStart(9)} | ${anovaResult.df_within.toString().padStart(5)} | ${anovaResult.MS_within.toFixed(4).padStart(9)} |           |           |`);
  console.log(`Total        | ${anovaResult.SS_total.toFixed(4).padStart(9)} | ${anovaResult.df_total.toString().padStart(5)} |           |           |           |`);
  
  console.log(`\nSignificant effect? ${anovaResult.pValue < options.alpha ? 'YES' : 'No'}`);
  console.log(`Effect size (η²): ${anovaResult.etaSquared.toFixed(4)}`);
  
  console.log('\nGroup Means:');
  console.log('Group                    |   N    |   Mean     |   Std. Dev.');
  console.log('-------------------------|--------|------------|------------');
  
  for (const group of groupInfo) {
    console.log(`${group.name.padEnd(24)} | ${group.n.toString().padStart(6)} | ${group.mean.toFixed(4).padStart(10)} | ${group.std.toFixed(4)}`);
  }
  
  if (options.postHoc && postHoc.length > 0) {
    console.log("\nPost-hoc tests (Tukey's HSD):");
    console.log('Comparison               |   Diff     |   SE       |   q       |   p       |   Sig.    |   95% CI');
    console.log('-------------------------|------------|------------|-----------|-----------|-----------|-------------------');
    
    for (const ph of postHoc) {
      const sig = ph.significant ? 'YES' : 'no';
      const ci = `[${ph.ciLower.toFixed(4)}, ${ph.ciUpper.toFixed(4)}]`;
      console.log(`${ph.group1.padEnd(15)} - ${ph.group2.padEnd(7)} | ${ph.meanDiff.toFixed(4).padStart(10)} | ${ph.se.toFixed(4).padStart(9)} | ${ph.q.toFixed(4).padStart(8)} | ${ph.pValue.toExponential(3).padStart(8)} | ${sig.padEnd(9)} | ${ci}`);
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
