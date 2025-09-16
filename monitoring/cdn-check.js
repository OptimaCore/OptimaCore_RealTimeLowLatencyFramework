const axios = require('axios');
const { logger } = require('../services/telemetry');
const fs = require('fs');
const path = require('path');
const config = require('../config/assets.json');
const cdnPolicy = require('./cdn-policy.json');

class CDNChecker {
  constructor() {
    this.cdnUrl = process.env.AZURE_CDN_URL;
    this.storageAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'assets';
    this.testFile = 'cdn-test-file.txt';
    this.testContent = 'OptimaCore CDN Test - ' + new Date().toISOString();
    this.results = [];
  }
  
  async runChecks() {
    logger.info('Starting CDN health checks', { cdnUrl: this.cdnUrl });
    
    try {
      await this.testEndpointAvailability();
      const fileUrl = await this.testFileUploadAndRetrieval();
      await this.testCacheHeaders(fileUrl);
      await this.generateReport();
      
      return {
        success: true,
        results: this.results,
        summary: this.getSummary()
      };
    } catch (error) {
      logger.error('CDN check failed', { error: error.message });
      this.results.push({
        test: 'CDN Health Check',
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      this.generateReport();
      return {
        success: false,
        error: error.message,
        results: this.results,
        summary: this.getSummary()
      };
    }
  }
  
  async testEndpointAvailability() {
    const testName = 'CDN Endpoint Availability';
    try {
      const response = await axios.head(this.cdnUrl, { timeout: 10000 });
      this.results.push({
        test: testName,
        status: 'passed',
        statusCode: response.status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw new Error(`CDN endpoint not available: ${error.message}`);
    }
  }
  
  async testFileUploadAndRetrieval() {
    const testName = 'File Upload and Retrieval';
    const blobClient = require('../services/assets/blob-client');
    
    try {
      const fileStream = require('stream').Readable.from([this.testContent]);
      const uploadResult = await blobClient.uploadFile(
        fileStream,
        this.testFile,
        'text/plain',
        { test: 'true', purpose: 'cdn-health-check' }
      );
      
      const cdnFileUrl = blobClient.getFileUrl(this.testFile);
      const response = await axios.get(cdnFileUrl, { timeout: 10000 });
      
      if (response.data !== this.testContent) {
        throw new Error('Downloaded content does not match uploaded content');
      }
      
      this.results.push({
        test: testName,
        status: 'passed',
        url: cdnFileUrl,
        timestamp: new Date().toISOString()
      });
      
      return cdnFileUrl;
    } catch (error) {
      throw new Error(`File test failed: ${error.message}`);
    }
  }
  
  async testCacheHeaders(fileUrl) {
    const testName = 'Cache Headers Validation';
    
    try {
      const response = await axios.head(fileUrl, { timeout: 10000 });
      const headers = response.headers;
      
      const requiredHeaders = ['cache-control', 'etag', 'last-modified'];
      const missingHeaders = requiredHeaders.filter(h => !headers[h]);
      
      const cacheControl = headers['cache-control'] || '';
      const cachePolicyMatch = cdnPolicy.cachePolicies.some(policy => 
        cacheControl.includes(policy.cacheControl)
      );
      
      this.results.push({
        test: testName,
        status: missingHeaders.length === 0 && cachePolicyMatch ? 'passed' : 'warning',
        cacheControl: headers['cache-control'],
        etag: !!headers['etag'],
        lastModified: !!headers['last-modified'],
        cachePolicyMatch,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      throw new Error(`Cache header test failed: ${error.message}`);
    }
  }
  
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      cdnUrl: this.cdnUrl,
      results: this.results,
      summary: this.getSummary()
    };
    
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportFile = path.join(reportsDir, `cdn-check-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    logger.info(`CDN check report generated: ${reportFile}`);
    return report;
  }
  
  getSummary() {
    const summary = { total: this.results.length, passed: 0, warnings: 0, failed: 0 };
    
    this.results.forEach(result => {
      if (result.status === 'passed') summary.passed++;
      else if (result.status === 'warning') summary.warnings++;
      else summary.failed++;
    });
    
    summary.success = summary.failed === 0 && summary.warnings === 0;
    return summary;
  }
}

// Run if executed directly
if (require.main === module) {
  (async () => {
    try {
      const checker = new CDNChecker();
      const result = await checker.runChecks();
      console.log('CDN Check completed:', result.summary);
      process.exit(result.summary.success ? 0 : 1);
    } catch (error) {
      console.error('CDN Check failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = CDNChecker;
