# Data Collection Pipeline

This directory contains the data collection and processing pipeline for experiment results.

## Directory Structure

```
data/
├── raw/                  # Raw JSON results (exact copies of input)
├── processed/            # Processed data (CSV, Parquet)
└── README.md             # This file
```

## Schema

The schema for experiment results is defined in `schemas/result-schema.json`. All results must conform to this schema.

## Processing Pipeline

1. **Raw Data Collection**:
   - Raw JSON results are copied to `data/raw/`
   - Files are validated against the schema
   - Invalid files are logged and skipped

2. **Data Processing**:
   - Valid results are processed into structured formats
   - CSV and Parquet formats are generated for analysis
   - A manifest is created for each processing run

## Scripts

### aggregate-data.js

Process experiment results into structured formats.

```bash
# Process all JSON files in the results directory
node scripts/aggregate-data.js --input results/*.json --out data/processed/

# Options:
#   --input <glob>      Input file pattern (required)
#   --out <dir>         Output directory (required)
#   --format <format>   Output format: csv, parquet, or both (default: both)
#   --tag <tag>         Experiment tag for the manifest (default: untagged)
#   --no-validate       Skip schema validation (not recommended)
```

### upload-to-blob.js

Upload processed data to Azure Blob Storage.

```bash
# Upload processed data to Azure Blob Storage
node scripts/upload-to-blob.js data/processed/ --container experiments

# Authentication options (required):
#   --connection-string <connStr>   Azure Storage connection string
#   --sas-token <token>            SAS token (requires --account-name)
#   --account-name <name>          Storage account name (for SAS token)

# Other options:
#   --container <name>   Blob container name (default: experiments)
#   --tag <tag>          Experiment tag for organization (default: untagged)
#   --dry-run            Show what would be uploaded without uploading
```

## Example Workflow

1. Run experiments and save results as JSON files in the `results/` directory
2. Process the results:
   ```bash
   node scripts/aggregate-data.js --input results/*.json --out data/processed/ --tag my_experiment
   ```
3. Upload to Azure Blob Storage:
   ```bash
   node scripts/upload-to-blob.js data/processed/ --container experiments --tag my_experiment --connection-string "your-connection-string"
   ```

## Dependencies

- Node.js 14+
- npm packages (install with `npm install`):
  - `commander`: Command-line argument parsing
  - `ajv`: JSON schema validation
  - `uuid`: Generate unique IDs
  - `json2csv`: Convert JSON to CSV
  - `parquetjs`: Parquet file format support
  - `@azure/storage-blob`: Azure Blob Storage client
  - `mime-types`: MIME type detection

## Error Handling

- Validation errors are logged to the console and saved to `{output_dir}/{tag}_errors.json`
- Failed uploads are recorded in the manifest with error details
- The pipeline continues processing even if some files fail validation or upload
