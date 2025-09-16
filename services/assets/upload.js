const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const blobClient = require('./blob-client');
const { logger } = require('../telemetry');
const fs = require('fs');
const path = require('path');
const config = require('../../config/assets.json');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB default
    files: config.maxFiles || 10 // Max number of files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = config.allowedTypes || ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error(`File type ${file.mimetype} is not allowed`);
      error.code = 'LIMIT_FILE_TYPE';
      return cb(error, false);
    }
    cb(null, true);
  }
});

// Single file upload endpoint
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded',
        storage_source: 'blob-upload'
      });
    }

    const fileStream = require('stream').Readable.from(req.file.buffer);
    const result = await blobClient.uploadFile(
      fileStream,
      req.file.originalname,
      req.file.mimetype,
      {
        userId: req.user?.id || 'anonymous',
        uploadId: uuidv4(),
        ...req.body.metadata
      }
    );

    res.json({
      success: true,
      data: result,
      storage_source: 'blob-upload'
    });
  } catch (error) {
    next(error);
  }
});

// Multiple files upload endpoint
router.post('/upload-multiple', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No files uploaded',
        storage_source: 'blob-upload'
      });
    }

    const uploadPromises = req.files.map(file => {
      const fileStream = require('stream').Readable.from(file.buffer);
      return blobClient.uploadFile(
        fileStream,
        file.originalname,
        file.mimetype,
        {
          userId: req.user?.id || 'anonymous',
          uploadId: uuidv4(),
          batchId: req.body.batchId,
          ...req.body.metadata
        }
      );
    });

    const results = await Promise.all(uploadPromises);
    
    res.json({
      success: true,
      count: results.length,
      files: results,
      storage_source: 'blob-upload'
    });
  } catch (error) {
    next(error);
  }
});

// Direct upload with presigned URL (for large files)
router.post('/initiate-upload', async (req, res, next) => {
  try {
    const { fileName, contentType, fileSize } = req.body;
    
    if (!fileName || !contentType) {
      return res.status(400).json({
        success: false,
        error: 'fileName and contentType are required',
        storage_source: 'blob-upload'
      });
    }

    // Validate file size
    const maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB default
    if (fileSize > maxFileSize) {
      return res.status(400).json({
        success: false,
        error: `File size exceeds maximum limit of ${maxFileSize} bytes`,
        storage_source: 'blob-upload'
      });
    }

    const blobName = blobClient.generateBlobName(fileName);
    const blockBlobClient = blobClient.containerClient.getBlockBlobClient(blobName);
    
    // Generate SAS token for upload
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + 60); // 1 hour expiry
    
    const sasUrl = await blockBlobClient.generateSasUrl({
      permissions: 'w', // Write only
      expiresOn,
      contentType,
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: blobClient.getCacheControlHeader(fileName)
      },
      metadata: {
        userId: req.user?.id || 'anonymous',
        uploadId: uuidv4(),
        originalName: fileName,
        storage_source: 'blob-upload'
      }
    });

    res.json({
      success: true,
      uploadUrl: sasUrl,
      blobName,
      expiresAt: expiresOn.toISOString(),
      storage_source: 'blob-upload'
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large',
      maxSize: config.maxFileSize,
      storage_source: 'blob-upload'
    });
  }
  
  if (err.code === 'LIMIT_FILE_TYPE') {
    return res.status(415).json({
      success: false,
      error: 'Invalid file type',
      allowedTypes: config.allowedTypes || ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      storage_source: 'blob-upload'
    });
  }
  
  logger.error('File upload error', {
    error: err.message,
    stack: err.stack,
    storage_source: 'blob-upload'
  });
  
  res.status(500).json({
    success: false,
    error: 'Failed to process upload',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    storage_source: 'blob-upload'
  });
});

// CLI tool for testing
if (require.main === module) {
  const fs = require('fs');
  const readline = require('readline');
  const { program } = require('commander');
  
  program
    .version('1.0.0')
    .description('Upload files to Azure Blob Storage')
    .requiredOption('-f, --file <path>', 'Path to the file to upload')
    .option('-t, --type <mimetype>', 'MIME type of the file')
    .option('-m, --metadata <json>', 'Additional metadata as JSON string');
  
  program.parse(process.argv);
  const options = program.opts();
  
  (async () => {
    try {
      const filePath = options.file;
      const fileName = path.basename(filePath);
      const fileStream = fs.createReadStream(filePath);
      
      // Detect MIME type if not provided
      let contentType = options.type;
      if (!contentType) {
        const mime = require('mime-types');
        contentType = mime.lookup(fileName) || 'application/octet-stream';
      }
      
      // Parse metadata if provided
      let metadata = {};
      if (options.metadata) {
        try {
          metadata = JSON.parse(options.metadata);
        } catch (e) {
          console.error('Invalid metadata JSON:', e.message);
          process.exit(1);
        }
      }
      
      console.log(`Uploading ${filePath} (${contentType})...`);
      
      const result = await blobClient.uploadFile(
        fileStream,
        fileName,
        contentType,
        {
          ...metadata,
          uploadedVia: 'cli',
          storage_source: 'blob-upload-cli'
        }
      );
      
      console.log('\nUpload successful!');
      console.log('File URL:', result.url);
      console.log('Blob name:', result.blobName);
      console.log('Size:', (result.size / 1024 / 1024).toFixed(2), 'MB');
      
      process.exit(0);
    } catch (error) {
      console.error('Upload failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = router;
