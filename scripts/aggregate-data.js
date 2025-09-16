#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const { parse } = require('json2csv');
const parquet = require('parquetjs');

// Command line options
program
  .requiredOption('-i, --input <glob>', 'Input file pattern (e.g., results/*.json)')
  .requiredOption('-o, --out <dir>', 'Output directory for processed data')
  .option('--format <format>', 'Output format (csv, parquet, or both)', 'both')
  .option('--tag <tag>', 'Experiment tag for the manifest', 'untagged')
  .option('--validate', 'Validate against schema before processing', true);

program.parse(process.argv);
const options = program.opts();

// Schema validation setup
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const schema = require(path.join(__dirname, '../schemas/result-schema.json'));
const validate = ajv.compile(schema);

// Create output directories
const rawDir = path.join(options.out, '..', 'raw');
const processedDir = options.out;

[rawDir, processedDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Find all matching input files
const glob = require('glob');
const inputFiles = glob.sync(options.input);

if (inputFiles.length === 0) {
  console.error('No input files found matching pattern:', options.input);
  process.exit(1);
}

console.log(`Found ${inputFiles.length} result files to process`);

// Process each file
const results = [];
const errors = [];
const runId = uuidv4();
const timestamp = new Date().toISOString();

// Parquet schema definition
const parquetSchema = new parquet.ParquetSchema({
  experiment_id: { type: 'UTF8' },
  run_id: { type: 'UTF8' },
  timestamp: { type: 'TIMESTAMP_MILLIS' },
  storage_source: { type: 'UTF8' },
  cache_hit: { type: 'BOOLEAN' },
  duration_ms: { type: 'DOUBLE', optional: true },
  error: { type: 'UTF8', optional: true },
  metrics: { type: 'JSON' },
  parameters: { type: 'JSON' },
  metadata: { 
    type: 'JSON',
    optional: true 
  },
  version: { type: 'UTF8' }
});

// Process files
for (const file of inputFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Validate against schema if enabled
    if (options.validate) {
      const valid = validate(data);
      if (!valid) {
        errors.push({
          file,
          errors: validate.errors
        });
        console.error(`Validation failed for ${file}:`, validate.errors);
        continue;
      }
    }
    
    // Add to results
    results.push(data);
    
    // Copy to raw data directory
    const filename = path.basename(file);
    fs.copyFileSync(file, path.join(rawDir, filename));
    
  } catch (error) {
    errors.push({
      file,
      error: error.message
    });
    console.error(`Error processing ${file}:`, error.message);
  }
}

if (results.length === 0) {
  console.error('No valid results to process');
  process.exit(1);
}

// Generate output files
const outputBase = `results_${options.tag}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
const manifest = {
  experiment_id: options.tag,
  run_id: runId,
  timestamp,
  input_files: inputFiles,
  valid_results: results.length,
  error_count: errors.length,
  storage_source: 'local',
  cache_hit: false,
  version: '1.0.0'
};

// Write manifest
fs.writeFileSync(
  path.join(processedDir, `${outputBase}_manifest.json`),
  JSON.stringify(manifest, null, 2)
);

// Write CSV if requested
if (['csv', 'both'].includes(options.format)) {
  try {
    const csv = parse(results, {
      fields: [
        'experiment_id',
        'run_id',
        'timestamp',
        'storage_source',
        'cache_hit',
        'duration_ms',
        'error',
        { label: 'metrics', value: row => JSON.stringify(row.metrics) },
        { label: 'parameters', value: row => JSON.stringify(row.parameters) },
        { label: 'metadata', value: row => JSON.stringify(row.metadata || {}) },
        'version'
      ]
    });
    
    fs.writeFileSync(
      path.join(processedDir, `${outputBase}.csv`),
      csv
    );
    console.log(`CSV output written to ${outputBase}.csv`);
  } catch (error) {
    console.error('Error generating CSV:', error);
    errors.push({ step: 'csv_generation', error: error.message });
  }
}

// Write Parquet if requested
if (['parquet', 'both'].includes(options.format)) {
  (async () => {
    try {
      const writer = await parquet.ParquetWriter.openFile(
        parquetSchema,
        path.join(processedDir, `${outputBase}.parquet`)
      );
      
      for (const row of results) {
        await writer.appendRow({
          ...row,
          metrics: JSON.stringify(row.metrics || {}),
          parameters: JSON.stringify(row.parameters || {}),
          metadata: JSON.stringify(row.metadata || {})
        });
      }
      
      await writer.close();
      console.log(`Parquet output written to ${outputBase}.parquet`);
    } catch (error) {
      console.error('Error generating Parquet:', error);
      errors.push({ step: 'parquet_generation', error: error.message });
    }
  })();
}

// Write errors if any
if (errors.length > 0) {
  const errorsFile = path.join(processedDir, `${outputBase}_errors.json`);
  fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2));
  console.error(`Encountered ${errors.length} errors. See ${errorsFile} for details.`);
}

console.log(`Processed ${results.length} results with ${errors.length} errors`);
