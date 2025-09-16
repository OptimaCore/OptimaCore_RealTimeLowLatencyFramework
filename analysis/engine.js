#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { anova, tTest } = require('./significance');
const { pearson, spearman } = require('./correlation');

// Parse command line arguments
program
  .name('analysis-engine')
  .description('Run statistical analysis on experiment data')
  .argument('<files...>', 'Input JSON files with experiment data')
  .option('-o, --out <file>', 'Output file for results', 'results/statistical-results.json')
  .option('--alpha <number>', 'Significance level (default: 0.05)', parseFloat, 0.05)
  .option('--min-samples <number>', 'Minimum samples per group (default: 5)', parseInt, 5)
  .parse(process.argv);

const options = program.opts();

/**
 * Loads and parses JSON files
 */
async function loadDataFiles(files) {
  const results = [];
  
  for (const file of files) {
    try {
      const content = await fs.promises.readFile(file, 'utf8');
      const data = JSON.parse(content);
      results.push({
        file,
        data,
        metadata: {
          filename: path.basename(file),
          timestamp: new Date().toISOString(),
          variant: data.metadata?.variant || 'unknown',
          experimentId: data.metadata?.experimentId || 'unknown',
          storageSource: data.metadata?.storageSource || 'unknown'
        }
      });
    } catch (error) {
      console.error(`Error loading file ${file}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Extracts metrics from data for analysis
 */
function extractMetrics(data) {
  const metrics = new Set();
  const variants = new Set();
  const storageSources = new Set();
  
  // First pass: collect all metrics, variants, and storage sources
  for (const { data: expData, metadata } of data) {
    variants.add(metadata.variant);
    storageSources.add(metadata.storageSource);
    
    if (expData.metrics) {
      Object.keys(expData.metrics).forEach(metric => metrics.add(metric));
    }
  }
  
  return { metrics: Array.from(metrics), variants: Array.from(variants), storageSources: Array.from(storageSources) };
}

/**
 * Groups data by variant and storage source
 */
function groupData(data, metric) {
  const groups = {};
  
  for (const { data: expData, metadata } of data) {
    const variant = metadata.variant;
    const source = metadata.storageSource;
    const value = expData.metrics?.[metric]?.value;
    
    if (value === undefined || value === null) continue;
    
    const key = `${variant}::${source}`;
    if (!groups[key]) {
      groups[key] = {
        variant,
        storageSource: source,
        values: []
      };
    }
    
    groups[key].values.push(Number(value));
  }
  
  // Filter out groups with insufficient samples
  return Object.values(groups).filter(group => group.values.length >= options.minSamples);
}

/**
 * Runs statistical tests on the data
 */
function runAnalysis(groupedData, metric) {
  const results = {
    metric,
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // Group by storage source for within-source analysis
  const bySource = {};
  for (const group of groupedData) {
    if (!bySource[group.storageSource]) {
      bySource[group.storageSource] = [];
    }
    bySource[group.storageSource].push(group);
  }
  
  // Run tests for each storage source
  for (const [source, groups] of Object.entries(bySource)) {
    if (groups.length < 2) continue; // Need at least 2 groups for comparison
    
    const sourceResults = {
      anova: null,
      pairwise: {}
    };
    
    // Run ANOVA if we have 3+ groups
    if (groups.length >= 3) {
      try {
        const anovaInput = groups.map(g => g.values);
        sourceResults.anova = anova(anovaInput, { alpha: options.alpha });
      } catch (error) {
        console.error(`ANOVA failed for ${metric} (${source}):`, error.message);
      }
    }
    
    // Run pairwise t-tests
    for (let i = 0; i < groups.length - 1; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const group1 = groups[i];
        const group2 = groups[j];
        const testKey = `${group1.variant}_vs_${group2.variant}`;
        
        try {
          sourceResults.pairwise[testKey] = {
            variant1: group1.variant,
            variant2: group2.variant,
            ...tTest(group1.values, group2.values, { alpha: options.alpha })
          };
        } catch (error) {
          console.error(`t-test failed for ${metric} (${source}, ${testKey}):`, error.message);
        }
      }
    }
    
    results.tests[source] = sourceResults;
  }
  
  return results;
}

/**
 * Saves results to a file
 */
async function saveResults(results, outputFile) {
  try {
    const outputDir = path.dirname(outputFile);
    await fs.promises.mkdir(outputDir, { recursive: true });
    await fs.promises.writeFile(
      outputFile,
      JSON.stringify(results, null, 2),
      'utf8'
    );
    console.log(`Results saved to ${outputFile}`);
  } catch (error) {
    console.error('Error saving results:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Loading data files...');
    const data = await loadDataFiles(program.args);
    
    if (data.length === 0) {
      console.error('No valid data files found');
      process.exit(1);
    }
    
    console.log(`Loaded ${data.length} data files`);
    const { metrics, variants, storageSources } = extractMetrics(data);
    
    console.log(`Found metrics: ${metrics.join(', ')}`);
    console.log(`Found variants: ${variants.join(', ')}`);
    console.log(`Found storage sources: ${storageSources.join(', ')}`);
    
    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        files: data.map(d => d.metadata.filename),
        variants,
        storageSources,
        metrics,
        alpha: options.alpha,
        minSamples: options.minSamples
      },
      analyses: []
    };
    
    // Run analysis for each metric
    for (const metric of metrics) {
      console.log(`\nAnalyzing metric: ${metric}`);
      const groupedData = groupData(data, metric);
      
      if (groupedData.length < 2) {
        console.warn(`Insufficient data for metric: ${metric}`);
        continue;
      }
      
      const analysis = runAnalysis(groupedData, metric);
      results.analyses.push(analysis);
    }
    
    // Save results
    await saveResults(results, options.out);
    
  } catch (error) {
    console.error('Error during analysis:', error);
    process.exit(1);
  }
}

// Run the analysis
if (require.main === module) {
  main();
}

module.exports = {
  loadDataFiles,
  extractMetrics,
  groupData,
  runAnalysis,
  saveResults
};
