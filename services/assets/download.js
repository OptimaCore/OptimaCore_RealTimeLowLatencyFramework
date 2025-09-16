const express = require('express');
const blobClient = require('./blob-client');
const { logger } = require('../telemetry');
const path = require('path');
const config = require('../../config/assets.json');

const router = express.Router();

// Redirect to CDN if available, otherwise serve directly
router.get('/:blobName(*)', async (req, res, next) => {
  try {
    const { blobName } = req.params;
    const { download, filename } = req.query;
    
    // If CDN is configured, redirect to CDN URL
    if (blobClient.cdnUrl) {
      const cdnUrl = blobClient.getFileUrl(blobName);
      
      logger.debug('Redirecting to CDN', {
        blobName,
        cdnUrl,
        storage_source: 'blob-download'
      });
      
      return res.redirect(302, cdnUrl);
    }
    
    // Otherwise, stream the file directly from blob storage
    const blockBlobClient = blobClient.containerClient.getBlockBlobClient(blobName);
    const properties = await blockBlobClient.getProperties();
    
    // Set appropriate headers
    res.set({
      'Content-Type': properties.contentType || 'application/octet-stream',
      'Content-Length': properties.contentLength,
      'ETag': properties.etag,
      'Last-Modified': properties.lastModified.toUTCString(),
      'Cache-Control': properties.cacheControl || blobClient.getCacheControlHeader(blobName),
      'Content-Disposition': `${download === 'true' ? 'attachment' : 'inline'}; filename="${filename || path.basename(blobName)}"`,
      'X-Storage-Source': 'blob-download'
    });
    
    // Stream the file
    const downloadResponse = await blockBlobClient.download();
    
    logger.info('Serving file from blob storage', {
      blobName,
      contentType: properties.contentType,
      contentLength: properties.contentLength,
      storage_source: 'blob-download'
    });
    
    return downloadResponse.readableStreamBody.pipe(res);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        storage_source: 'blob-download'
      });
    }
    
    logger.error('Error serving file', {
      error: error.message,
      blobName: req.params.blobName,
      storage_source: 'blob-download'
    });
    
    next(error);
  }
});

// Generate a time-limited download URL
router.get('/signed/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;
    const { expiresIn = '30' } = req.query; // in minutes
    
    const expiresInMinutes = Math.min(parseInt(expiresIn, 10) || 30, 1440); // Max 24 hours
    const { url, expiresAt } = await blobClient.generateSasUrl(blobName, expiresInMinutes);
    
    res.json({
      success: true,
      url,
      expiresAt,
      blobName,
      storage_source: 'blob-download-signed'
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        storage_source: 'blob-download-signed'
      });
    }
    
    logger.error('Error generating signed URL', {
      error: error.message,
      blobName: req.params.blobName,
      storage_source: 'blob-download-signed'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate download URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      storage_source: 'blob-download-signed'
    });
  }
});

// Get file metadata
router.get('/metadata/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;
    const blockBlobClient = blobClient.containerClient.getBlockBlobClient(blobName);
    const properties = await blockBlobClient.getProperties();
    
    res.json({
      success: true,
      name: blobName,
      url: blobClient.getFileUrl(blobName),
      contentType: properties.contentType,
      contentLength: properties.contentLength,
      lastModified: properties.lastModified,
      metadata: properties.metadata,
      storage_source: 'blob-metadata'
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        storage_source: 'blob-metadata'
      });
    }
    
    logger.error('Error fetching file metadata', {
      error: error.message,
      blobName: req.params.blobName,
      storage_source: 'blob-metadata'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch file metadata',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      storage_source: 'blob-metadata'
    });
  }
});

// Delete a file
router.delete('/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;
    const result = await blobClient.deleteFile(blobName);
    
    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        storage_source: 'blob-delete'
      });
    }
    
    res.json({
      success: true,
      message: 'File deleted successfully',
      blobName,
      storage_source: 'blob-delete'
    });
  } catch (error) {
    logger.error('Error deleting file', {
      error: error.message,
      blobName: req.params.blobName,
      storage_source: 'blob-delete'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      storage_source: 'blob-delete'
    });
  }
});

// List all files (with pagination)
router.get('/', async (req, res) => {
  try {
    const { prefix = '', maxResults = 100, marker } = req.query;
    const blobs = [];
    const iterator = blobClient.containerClient.listBlobsFlat({
      prefix,
      includeMetadata: true
    }).byPage({ maxPageSize: Math.min(parseInt(maxResults, 10) || 100, 1000) });
    
    for await (const page of iterator) {
      blobs.push(...page.segment.blobItems.map(blob => ({
        name: blob.name,
        url: blobClient.getFileUrl(blob.name),
        contentType: blob.properties.contentType,
        contentLength: blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        metadata: blob.metadata,
        etag: blob.properties.etag
      })));
    }
    
    res.json({
      success: true,
      count: blobs.length,
      blobs,
      storage_source: 'blob-list'
    });
  } catch (error) {
    logger.error('Error listing blobs', {
      error: error.message,
      storage_source: 'blob-list'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to list files',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      storage_source: 'blob-list'
    });
  }
});

module.exports = router;
