const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const cliProgress = require('cli-progress');
const { mean, std, median, min, max } = require('mathjs');

/**
 * Load and parse data from files
 * @param {string[]} filePatterns - Array of file patterns or paths
 * @param {boolean} verbose - Whether to show progress
 * @returns {Object} Object containing results and errors
 */
async function loadData(filePatterns, verbose = false) {
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
    return { results: [], errors: [{ file: 'all', error: 'No valid input files found' }] };
  }
  
  // Process each file
  const results = [];
  const errors = [];
  let progressBar;
  
  if (verbose) {
    console.log(`Processing ${fileList.length} files...`);
    progressBar = new cliProgress.SingleBar({
      format: 'Progress |{bar}| {percentage}% | {value}/{total} files',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    progressBar.start(fileList.length, 0);
  }
  
  for (const [index, file] of fileList.entries()) {
    try {
      if (verbose) {
        progressBar.update(index + 1, { file: path.basename(file) });
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
      if (verbose) {
        console.error(`\nError processing ${file}:`, error.message);
      }
    }
  }
  
  if (verbose) {
    progressBar.stop();
    console.log(`Processed ${results.length} records with ${errors.length} errors`);
  }
  
  return { results, errors };
}

/**
 * Group data by specified fields and extract metrics
 * @param {Array} data - Array of data objects
 * @param {string[]} groupFields - Fields to group by
 * @param {string[]} metrics - Metrics to extract
 * @returns {Map} Grouped data
 */
function groupData(data, groupFields, metrics) {
  const groups = new Map();
  
  for (const record of data) {
    // Skip records without required metrics
    const hasAllMetrics = metrics.every(m => {
      const value = m.split('.').reduce((obj, key) => obj && obj[key], record);
      return typeof value === 'number' && isFinite(value);
    });
    
    if (!hasAllMetrics) continue;
    
    // Create group key
    const groupKey = groupFields
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
      for (const field of groupFields) {
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
  
  return groups;
}

/**
 * Calculate basic statistics for an array of numbers
 * @param {number[]} values - Array of numeric values
 * @returns {Object} Statistics object
 */
function calculateBasicStats(values) {
  if (!values || values.length === 0) {
    return {
      count: 0,
      mean: null,
      median: null,
      std: null,
      min: null,
      max: null
    };
  }
  
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    std: std(values, 'uncorrected'),
    min: min(values),
    max: max(values)
  };
}

/**
 * Calculate percentiles for an array of numbers
 * @param {number[]} values - Array of numeric values
 * @param {number[]} percentiles - Array of percentiles (0-1)
 * @returns {Object} Percentile values
 */
function calculatePercentiles(values, percentiles = [0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
  if (!values || values.length === 0) return {};
  
  const sorted = [...values].sort((a, b) => a - b);
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

/**
 * Calculate bootstrap confidence intervals
 * @param {number[]} data - Array of numeric values
 * @param {Function} statFn - Function to calculate statistic (default: mean)
 * @param {Object} options - Options
 * @param {number} options.samples - Number of bootstrap samples
 * @param {number} options.ciLevel - Confidence level (0-1)
 * @returns {Object} Confidence interval
 */
function bootstrapCI(data, statFn = mean, { samples = 1000, ciLevel = 0.95 } = {}) {
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

module.exports = {
  loadData,
  groupData,
  calculateBasicStats,
  calculatePercentiles,
  bootstrapCI
};
