#!/usr/bin/env node

const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

// Command line options
program
  .requiredArgument('<source>', 'Source directory or file to upload')
  .option('--container <name>', 'Blob container name', 'experiments')
  .option('--connection-string <connStr>', 'Azure Storage connection string')
  .option('--sas-token <token>', 'SAS token for authentication')
  .option('--account-name <name>', 'Storage account name (if using SAS token)')
  .option('--tag <tag>', 'Experiment tag for organization', 'untagged')
  .option('--dry-run', 'Show what would be uploaded without actually uploading', false);

program.parse(process.argv);
const options = program.opts();
const sourcePath = program.args[0];

// Validate authentication options
if (!options.connectionString && !(options.sasToken && options.accountName)) {
  console.error('Error: Either --connection-string or both --sas-token and --account-name must be provided');
  process.exit(1);
}

// Initialize Blob Service Client
let blobServiceClient;
if (options.connectionString) {
  blobServiceClient = BlobServiceClient.fromConnectionString(options.connectionString);
} else {
  const accountUrl = `https://${options.accountName}.blob.core.windows.net`;
  const sasUrl = `${accountUrl}?${options.sasToken}`;
  blobServiceClient = new BlobServiceClient(sasUrl);
}

// Get container reference
const containerClient = blobServiceClient.getContainerClient(options.container);

// Track uploads
const uploads = [];
const errors = [];
const runId = uuidv4();
const timestamp = new Date().toISOString();

// Create container if it doesn't exist
async function ensureContainerExists() {
  if (options.dryRun) return;
  
  try {
    await containerClient.createIfNotExists();
    console.log(`Using container: ${options.container}`);
  } catch (error) {
    console.error(`Error creating container ${options.container}:`, error.message);
    process.exit(1);
  }
}

// Upload a single file
async function uploadFile(filePath, blobPath) {
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  
  if (options.dryRun) {
    console.log(`[DRY RUN] Would upload: ${filePath} -> ${blobPath} (${contentType})`);
    return { path: blobPath, size: fs.statSync(filePath).size };
  }
  
  try {
    const uploadResponse = await blockBlobClient.uploadFile(filePath, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
    
    console.log(`Uploaded: ${filePath} -> ${blobPath} (${uploadResponse.contentLength} bytes)`);
    return { 
      path: blobPath, 
      size: uploadResponse.contentLength,
      etag: uploadResponse.etag,
      lastModified: uploadResponse.lastModified
    };
  } catch (error) {
    console.error(`Error uploading ${filePath}:`, error.message);
    throw error;
  }
}

// Process a directory or file
async function processPath(currentPath, basePath = '') {
  const stats = fs.statSync(currentPath);
  
  if (stats.isDirectory()) {
    const files = fs.readdirSync(currentPath);
    
    for (const file of files) {
      const fullPath = path.join(currentPath, file);
      const relativePath = basePath ? `${basePath}/${file}` : file;
      await processPath(fullPath, relativePath);
    }
  } else {
    // Skip hidden files and system files
    if (path.basename(currentPath).startsWith('.')) {
      return;
    }
    
    // Create blob path with experiment tag and run ID
    const blobPath = `${options.tag}/${runId}/${basePath || path.basename(currentPath)}`;
    
    try {
      const result = await uploadFile(currentPath, blobPath);
      uploads.push({
        localPath: currentPath,
        blobPath: blobPath,
        size: result.size,
        uploadedAt: new Date().toISOString()
      });
    } catch (error) {
      errors.push({
        file: currentPath,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Generate and upload manifest
async function uploadManifest() {
  const manifest = {
    experiment_id: options.tag,
    run_id: runId,
    timestamp,
    container: options.container,
    uploads: uploads.map(upload => ({
      blob_path: upload.blobPath,
      size: upload.size,
      uploaded_at: upload.uploadedAt
    })),
    error_count: errors.length,
    storage_source: 'azure-blob',
    version: '1.0.0'
  };
  
  const manifestContent = JSON.stringify(manifest, null, 2);
  const manifestPath = path.join(path.dirname(sourcePath), `${options.tag}_${runId}_manifest.json`);
  
  // Save manifest locally
  fs.writeFileSync(manifestPath, manifestContent);
  
  // Upload manifest
  const blobPath = `${options.tag}/${runId}/manifest.json`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  
  if (!options.dryRun) {
    await blockBlobClient.upload(manifestContent, manifestContent.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
  }
  
  console.log(`\nManifest: ${manifestPath}`);
  if (!options.dryRun) {
    console.log(`Manifest uploaded to: ${blobPath}`);
  }
  
  return manifest;
}

// Main function
async function main() {
  console.log(`Starting upload to Azure Blob Storage (${options.dryRun ? 'DRY RUN' : 'LIVE'})`);
  console.log(`Source: ${sourcePath}`);
  
  await ensureContainerExists();
  
  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source path does not exist: ${sourcePath}`);
    process.exit(1);
  }
  
  // Process the source path
  const stats = fs.statSync(sourcePath);
  if (stats.isFile()) {
    const blobPath = `${options.tag}/${runId}/${path.basename(sourcePath)}`;
    const result = await uploadFile(sourcePath, blobPath);
    uploads.push({
      localPath: sourcePath,
      blobPath: blobPath,
      size: result.size,
      uploadedAt: new Date().toISOString()
    });
  } else {
    await processPath(sourcePath);
  }
  
  // Upload manifest
  await uploadManifest();
  
  // Print summary
  console.log('\nUpload Summary:');
  console.log(`- Files uploaded: ${uploads.length}`);
  console.log(`- Total size: ${uploads.reduce((sum, file) => sum + (file.size || 0), 0)} bytes`);
  
  if (errors.length > 0) {
    console.error(`\nEncountered ${errors.length} errors:`);
    errors.forEach((error, index) => {
      console.error(`${index + 1}. ${error.file}: ${error.error}`);
    });
    
    // Save errors to file
    const errorsFile = path.join(path.dirname(sourcePath), `${options.tag}_${runId}_errors.json`);
    fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2));
    console.log(`\nError details saved to: ${errorsFile}`);
  }
  
  console.log('\nUpload completed!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
