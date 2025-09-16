const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { logger } = require('../telemetry');
const config = require('../../config/assets.json');
const path = require('path');
const mime = require('mime-types');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

class BlobStorageClient {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'assets';
    this.cdnUrl = process.env.AZURE_CDN_URL;
    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB default
    
    if (!this.accountName) {
      throw new Error('AZURE_STORAGE_ACCOUNT_NAME is required');
    }

    // Use shared key auth if available, otherwise use DefaultAzureCredential
    if (this.accountKey) {
      const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
    } else {
      // For production with managed identity
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        new DefaultAzureCredential()
      );
    }

    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    this.initializeContainer();
  }

  async initializeContainer() {
    try {
      await this.containerClient.createIfNotExists({
        access: 'blob', // Public read access for blobs
        metadata: {
          createdBy: 'OptimaCore',
          purpose: 'Asset storage'
        }
      });
      logger.info(`Container ${this.containerName} is ready`);
    } catch (error) {
      logger.error('Failed to initialize blob container', {
        error: error.message,
        container: this.containerName,
        storage_source: 'blob-storage'
      });
      throw error;
    }
  }

  async uploadFile(fileStream, fileName, contentType, metadata = {}) {
    const blobName = this.generateBlobName(fileName);
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    
    try {
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType || mime.lookup(fileName) || 'application/octet-stream',
          blobCacheControl: this.getCacheControlHeader(fileName)
        },
        metadata: {
          ...metadata,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          storage_source: 'blob-storage'
        }
      };

      await blockBlobClient.uploadStream(
        fileStream,
        config.uploadOptions?.bufferSize || 4 * 1024 * 1024, // 4MB chunks
        config.uploadOptions?.maxConcurrency || 5,
        uploadOptions
      );

      const url = this.getFileUrl(blobName);
      
      logger.info('File uploaded successfully', {
        fileName,
        blobName,
        url,
        contentType: uploadOptions.blobHTTPHeaders.blobContentType,
        storage_source: 'blob-storage'
      });

      return {
        success: true,
        fileName,
        blobName,
        url,
        contentType: uploadOptions.blobHTTPHeaders.blobContentType,
        size: (await blockBlobClient.getProperties()).contentLength,
        metadata: uploadOptions.metadata
      };
    } catch (error) {
      logger.error('Error uploading file to blob storage', {
        error: error.message,
        fileName,
        blobName,
        storage_source: 'blob-storage'
      });
      throw error;
    }
  }

  async downloadFile(blobName, writeStream) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    
    try {
      const downloadResponse = await blockBlobClient.download(0);
      await pipeline(downloadResponse.readableStreamBody, writeStream);
      
      logger.info('File downloaded successfully', {
        blobName,
        storage_source: 'blob-storage'
      });
      
      return {
        success: true,
        blobName,
        contentType: downloadResponse.contentType,
        contentLength: downloadResponse.contentLength,
        lastModified: downloadResponse.lastModified,
        metadata: downloadResponse.metadata
      };
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn('File not found in blob storage', {
          blobName,
          storage_source: 'blob-storage'
        });
        return { success: false, error: 'File not found', statusCode: 404 };
      }
      
      logger.error('Error downloading file from blob storage', {
        error: error.message,
        blobName,
        storage_source: 'blob-storage'
      });
      throw error;
    }
  }

  async deleteFile(blobName) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    
    try {
      await blockBlobClient.delete();
      
      logger.info('File deleted successfully', {
        blobName,
        storage_source: 'blob-storage'
      });
      
      return { success: true, blobName };
    } catch (error) {
      if (error.statusCode === 404) {
        return { success: false, error: 'File not found', statusCode: 404 };
      }
      
      logger.error('Error deleting file from blob storage', {
        error: error.message,
        blobName,
        storage_source: 'blob-storage'
      });
      throw error;
    }
  }

  getFileUrl(blobName) {
    if (this.cdnUrl) {
      return `${this.cdnUrl.replace(/\/+$/, '')}/${blobName}`;
    }
    
    const blobClient = this.containerClient.getBlobClient(blobName);
    return blobClient.url;
  }

  generateBlobName(originalName) {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const extension = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, extension).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    return `${timestamp}-${randomString}-${baseName}${extension}`;
  }

  getCacheControlHeader(fileName) {
    const extension = path.extname(fileName).toLowerCase().substring(1);
    const cacheRules = config.cacheRules || {};
    
    // Check for exact match first
    if (cacheRules[extension]) {
      return cacheRules[extension];
    }
    
    // Check for type-based rules
    const fileType = this.getFileType(extension);
    if (cacheRules[fileType]) {
      return cacheRules[fileType];
    }
    
    // Default cache control
    return cacheRules.default || 'public, max-age=31536000'; // 1 year
  }

  getFileType(extension) {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'];
    const videoTypes = ['mp4', 'webm', 'ogg', 'mov'];
    const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
    
    if (imageTypes.includes(extension)) return 'image';
    if (videoTypes.includes(extension)) return 'video';
    if (documentTypes.includes(extension)) return 'document';
    
    return 'other';
  }

  async generateSasUrl(blobName, expiresInMinutes = 30) {
    const blobClient = this.containerClient.getBlobClient(blobName);
    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'), // Read only
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000)
    };
    
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      this.blobServiceClient.credential
    ).toString();
    
    return {
      url: `${blobClient.url}?${sasToken}`,
      expiresAt: sasOptions.expiresOn.toISOString()
    };
  }
}

// Create a singleton instance
const blobClient = new BlobStorageClient();

module.exports = blobClient;
