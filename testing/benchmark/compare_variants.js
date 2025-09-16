#!/usr/bin/env node

/**
 * Compare Variants Tool for Benchmark Results
 * 
 * Analyzes and compares benchmark results from different test runs.
 * Generates a summary report with statistics and visualizations.
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');
const Table = require('cli-table3');
const { plot } = require('asciichart');

// Initialize command line interface
const program = new Command();
program
  .name('compare-variants')
  .description('Compare benchmark results from different test runs')
  .version('1.0.0')
  .requiredOption('-f, --files <files...>', 'Result files to compare')
  .option('-o, --output <file>', 'Output file for the comparison report')
  .option('--csv', 'Output in CSV format', false)
  .option('--json', 'Output in JSON format', false)
  .parse(process.argv);

const options = program.opts();

/**
 * Load and parse result files
 */
function loadResults() {
  const results = [];
  
  for (const file of options.files) {
    try {
      const filePath = path.resolve(file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Extract variant name from filename if not present in the data
      if (!data.metadata) {
        data.metadata = { variant: path.basename(file, '.json') };
      }
      
      results.push({
        file,
        ...data
      });
    } catch (error) {
      console.error(`❌ Error loading ${file}:`, error.message);
    }
  }
  
  if (results.length === 0) {
    console.error('❌ No valid result files to compare');
    process.exit(1);
  }
  
  return results;
}

/**
 * Generate comparison report
 */
function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    comparedVariants: results.map(r => r.metadata.variant || 'unknown'),
    comparisons: {}
  };
  
  // Compare latency metrics
  report.comparisons.latency = results.map(result => ({
    variant: result.metadata.variant || path.basename(result.file, '.json'),
    avg: result.summary?.latency?.avg || 0,
    p50: result.summary?.latency?.p50 || 0,
    p90: result.summary?.latency?.p90 || 0,
    p95: result.summary?.latency?.p95 || 0,
    p99: result.summary?.latency?.p99 || 0,
    min: result.summary?.latency?.min || 0,
    max: result.summary?.latency?.max || 0,
  }));
  
  // Compare success rates and cache hits
  report.comparisons.successRates = results.map(result => ({
    variant: result.metadata.variant || path.basename(result.file, '.json'),
    totalRequests: result.summary?.totalRequests || 0,
    successfulRequests: result.summary?.successfulRequests || 0,
    successRate: result.summary?.successfulRequests && result.summary?.totalRequests 
      ? (result.summary.successfulRequests / result.summary.totalRequests) * 100 
      : 0,
    cacheHitRate: result.summary?.cacheHitRate || 0,
  }));
  
  // Compare storage sources
  const allStorageSources = new Set();
  results.forEach(result => {
    if (result.summary?.storageSources) {
      Object.keys(result.summary.storageSources).forEach(source => {
        allStorageSources.add(source);
      });
    }
  });
  
  report.comparisons.storageSources = Array.from(allStorageSources).map(source => {
    const sourceData = { source };
    results.forEach(result => {
      const variant = result.metadata.variant || path.basename(result.file, '.json');
      const count = result.summary?.storageSources?.[source] || 0;
      const total = result.summary?.successfulRequests || 1;
      sourceData[variant] = {
        count,
        percentage: (count / total) * 100
      };
    });
    return sourceData;
  });
  
  return report;
}

/**
 * Format the report for console output
 */
function formatConsoleReport(report) {
  const output = [];
  
  // Header
  output.push(chalk.bold.blue('\n📊 Benchmark Comparison Report'));
  output.push(chalk.gray(`Generated at: ${new Date().toLocaleString()}`));
  output.push(chalk.gray(`Variants: ${report.comparedVariants.join(', ')}`));
  output.push('');
  
  // Latency Comparison Table
  const latencyTable = new Table({
    head: [
      'Variant', 'Avg (ms)', 'p50 (ms)', 'p90 (ms)', 'p95 (ms)', 'p99 (ms)', 'Min (ms)', 'Max (ms)'
    ],
    style: { head: ['cyan'] },
    colAligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right']
  });
  
  report.comparisons.latency.forEach(variant => {
    latencyTable.push([
      variant.variant,
      variant.avg.toFixed(2),
      variant.p50.toFixed(2),
      variant.p90.toFixed(2),
      variant.p95.toFixed(2),
      variant.p99.toFixed(2),
      variant.min.toFixed(2),
      variant.max.toFixed(2)
    ]);
  });
  
  output.push(chalk.bold('⏱  Latency Comparison (ms)'));
  output.push(latencyTable.toString());
  output.push('');
  
  // Success Rates Table
  const successTable = new Table({
    head: [
      'Variant', 'Total', 'Successful', 'Success Rate', 'Cache Hit Rate'
    ],
    style: { head: ['cyan'] },
    colAligns: ['left', 'right', 'right', 'right', 'right']
  });
  
  report.comparisons.successRates.forEach(variant => {
    successTable.push([
      variant.variant,
      variant.totalRequests,
      variant.successfulRequests,
      `${variant.successRate.toFixed(2)}%`,
      `${variant.cacheHitRate.toFixed(2)}%`
    ]);
  });
  
  output.push(chalk.bold('✅ Success & Cache Rates'));
  output.push(successTable.toString());
  output.push('');
  
  // Storage Sources Table
  if (report.comparisons.storageSources.length > 0) {
    const storageTable = new Table({
      head: ['Storage Source', ...report.comparedVariants.map(v => `${v} %`)],
      style: { head: ['cyan'] },
      colAligns: ['left', ...Array(report.comparedVariants.length).fill('right')]
    });
    
    report.comparisons.storageSources.forEach(sourceData => {
      const row = [sourceData.source];
      report.comparedVariants.forEach(variant => {
        row.push(sourceData[variant] 
          ? `${sourceData[variant].percentage.toFixed(1)}%` 
          : '0%');
      });
      storageTable.push(row);
    });
    
    output.push(chalk.bold('💾 Storage Source Distribution'));
    output.push(storageTable.toString());
    output.push('');
  }
  
  // Add ASCII chart for latency comparison
  if (report.comparisons.latency.length > 0) {
    output.push(chalk.bold('📈 Latency Distribution (p50, p90, p95, p99)'));
    
    const series = [
      report.comparisons.latency.map(v => v.p50),
      report.comparisons.latency.map(v => v.p90),
      report.comparisons.latency.map(v => v.p95),
      report.comparisons.latency.map(v => v.p99)
    ];
    
    const colors = [
      chalk.green,
      chalk.yellow,
      chalk.blue,
      chalk.red
    ];
    
    const chart = plot(series, {
      height: 10,
      colors: [chalk.green, chalk.yellow, chalk.blue, chalk.red],
      min: 0,
      format: x => Math.round(x).toString().padStart(4) + 'ms'
    });
    
    output.push(chart);
    output.push(`  ${chalk.green('p50')}  ${chalk.yellow('p90')}  ${chalk.blue('p95')}  ${chalk.red('p99')}`);
    output.push('');
    
    // Legend for variants
    const variantLabels = report.comparedVariants.map((v, i) => 
      `${chalk.cyan(i + 1)}. ${v}`
    );
    output.push(chalk.bold('Variants:'));
    output.push(variantLabels.join('   '));
    output.push('');
  }
  
  return output.join('\n');
}

/**
 * Save report to file
 */
function saveReport(report, format) {
  if (!options.output) return;
  
  try {
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let content;
    let extension = '.txt';
    
    if (format === 'json' || options.json) {
      content = JSON.stringify(report, null, 2);
      extension = '.json';
    } else if (format === 'csv' || options.csv) {
      // Convert to CSV format
      const rows = [];
      
      // Add latency data
      rows.push('Metric,Type,Variant,Value');
      report.comparisons.latency.forEach(variant => {
        rows.push(`latency,avg,${variant.variant},${variant.avg}`);
        rows.push(`latency,p50,${variant.variant},${variant.p50}`);
        rows.push(`latency,p90,${variant.variant},${variant.p90}`);
        rows.push(`latency,p95,${variant.variant},${variant.p95}`);
        rows.push(`latency,p99,${variant.variant},${variant.p99}`);
      });
      
      // Add success rate data
      report.comparisons.successRates.forEach(variant => {
        rows.push(`success,rate,${variant.variant},${variant.successRate}`);
        rows.push(`cache,hit_rate,${variant.variant},${variant.cacheHitRate}`);
      });
      
      content = rows.join('\n');
      extension = '.csv';
    } else {
      // Default to text format
      content = formatConsoleReport(report);
    }
    
    // Ensure the filename has the correct extension
    let outputFile = options.output;
    if (!outputFile.endsWith(extension)) {
      outputFile += extension;
    }
    
    fs.writeFileSync(outputFile, content, 'utf8');
    console.log(`\n✅ Report saved to ${chalk.cyan(outputFile)}`);
  } catch (error) {
    console.error('❌ Failed to save report:', error.message);
  }
}

// Main execution
function main() {
  console.log(chalk.blue('\n🔍 Loading benchmark results...'));
  
  const results = loadResults();
  console.log(`✓ Loaded ${chalk.green(results.length)} result files`);
  
  const report = generateReport(results);
  
  // Output to console
  console.log(formatConsoleReport(report));
  
  // Save to file if output option is provided
  if (options.output) {
    const format = options.csv ? 'csv' : (options.json ? 'json' : 'text');
    saveReport(report, format);
  }
}

main();
