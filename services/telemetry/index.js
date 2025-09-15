const { v4: uuidv4 } = require('uuid');
const { performance, PerformanceObserver } = require('perf_hooks');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { DefaultAzureCredential } = require('@azure/identity');
const { ApplicationInsightsClient } = require('@azure/monitor-query');

// Load schema
const telemetrySchema = require('../../schemas/telemetry-schema.json');

class Telemetry {
  constructor(options = {}) {
    // Initialize with default options
    this.options = {
      region: process.env.AZURE_REGION || 'eastus',
      appInsightsConnectionString: process.env.APPINSIGHTS_CONNECTION_STRING,
      enableAppInsights: true,
      enableFileLogging: true,
      logDirectory: path.join(process.cwd(), 'telemetry-logs'),
      ...options
    };

    // Initialize performance tracking
    this.performance = performance;
    this.performanceObserver = null;
    this.measurements = new Map();
    this.setupPerformanceObserver();

    // Initialize schema validator
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.validate = this.ajv.compile(telemetrySchema);

    // Initialize Azure Application Insights client if enabled
    this.appInsightsClient = null;
    if (this.options.enableAppInsights && this.options.appInsightsConnectionString) {
      this.initializeAppInsights();
    }

    // Ensure log directory exists
    if (this.options.enableFileLogging) {
      fs.mkdir(this.options.logDirectory, { recursive: true }).catch(console.error);
    }
  }

  setupPerformanceObserver() {
    this.performanceObserver = new PerformanceObserver((items) => {
      items.getEntries().forEach((entry) => {
        this.measurements.set(entry.name, entry);
      });
    });
    
    this.performanceObserver.observe({ entryTypes: ['measure'] });
  }

  initializeAppInsights() {
    try {
      const credential = new DefaultAzureCredential();
      this.appInsightsClient = new ApplicationInsightsClient(credential);
    } catch (error) {
      console.error('Failed to initialize Application Insights client:', error);
      this.options.enableAppInsights = false;
    }
  }

  async startRequest() {
    const requestId = uuidv4();
    const startMark = `request-${requestId}-start`;
    const endMark = `request-${requestId}-end`;
    
    this.performance.mark(startMark);
    
    // Get initial CPU and memory usage
    const startCpuUsage = process.cpuUsage();
    const startMemoryUsage = process.memoryUsage();
    
    return {
      requestId,
      startMark,
      endMark,
      startCpuUsage,
      startMemoryUsage,
      startTime: Date.now(),
      metrics: {}
    };
  }

  async endRequest(context, metadata = {}) {
    const {
      requestId,
      startMark,
      endMark,
      startCpuUsage,
      startMemoryUsage,
      startTime,
      metrics = {}
    } = context;

    // Mark the end of the request
    this.performance.mark(endMark);
    
    // Measure the total duration
    const measureName = `request-${requestId}-total`;
    this.performance.measure(measureName, startMark, endMark);
    
    // Get CPU and memory usage
    const endCpuUsage = process.cpuUsage(startCpuUsage);
    const endMemoryUsage = process.memoryUsage();
    
    // Calculate CPU usage percentage
    const cpuUsagePercent = (endCpuUsage.user + endCpuUsage.system) / 1000; // Convert to ms
    
    // Get performance measurements
    const measurements = this.measurements.get(measureName) || {};
    
    // Prepare telemetry data
    const telemetryData = {
      timestamp: new Date().toISOString(),
      request_id: requestId,
      region: this.options.region,
      dns_ms: metrics.dnsLookup || 0,
      tls_ms: metrics.tlsHandshake || 0,
      ttfb_ms: metrics.firstByte || 0,
      total_ms: measurements.duration || (Date.now() - startTime),
      storage_source: metadata.storageSource || 'ssd', // Default to ssd if not specified
      cache_hit: metadata.cacheHit || false,
      db_type: metadata.dbType || 'none', // Default to none if not specified
      cpu: cpuUsagePercent,
      mem: (endMemoryUsage.heapUsed / (1024 * 1024)).toFixed(2), // Convert to MB
      metadata: {
        ...metadata,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      }
    };

    // Validate against schema
    const valid = this.validate(telemetryData);
    if (!valid) {
      console.error('Invalid telemetry data:', this.validate.errors);
      throw new Error(`Invalid telemetry data: ${JSON.stringify(this.validate.errors, null, 2)}`);
    }

    // Export to configured targets
    await this.exportTelemetry(telemetryData);

    // Clean up performance marks to prevent memory leaks
    this.performance.clearMarks(startMark);
    this.performance.clearMarks(endMark);
    this.performance.clearMeasures(measureName);
    this.measurements.delete(measureName);

    return telemetryData;
  }

  async exportTelemetry(data) {
    const exportPromises = [];
    
    // Export to Application Insights if enabled
    if (this.options.enableAppInsights && this.appInsightsClient) {
      exportPromises.push(this.exportToAppInsights(data));
    }
    
    // Export to file if enabled
    if (this.options.enableFileLogging) {
      exportPromises.push(this.exportToFile(data));
    }
    
    // Wait for all exports to complete
    await Promise.allSettled(exportPromises);
  }

  async exportToAppInsights(data) {
    if (!this.appInsightsClient) return;
    
    try {
      // In a real implementation, you would use the Application Insights client
      // to send custom telemetry. This is a simplified example.
      console.log('Exporting to Application Insights:', {
        name: 'RequestTelemetry',
        time: new Date(data.timestamp),
        properties: data,
        measurements: {
          duration: data.total_ms,
          dnsLookup: data.dns_ms,
          tlsHandshake: data.tls_ms,
          ttfb: data.ttfb_ms,
          cpu: data.cpu,
          memory: data.mem
        }
      });
      
      // In a real implementation, you would use the client like this:
      // await this.appInsightsClient.trackEvent({
      //   name: 'RequestTelemetry',
      //   time: new Date(data.timestamp),
      //   properties: data,
      //   measurements: {
      //     duration: data.total_ms,
      //     dnsLookup: data.dnsLookup,
      //     tlsHandshake: data.tlsHandshake,
      //     ttfb: data.ttfb_ms,
      //     cpu: data.cpu,
      //     memory: data.mem
      //   }
      // });
      
    } catch (error) {
      console.error('Failed to export to Application Insights:', error);
    }
  }

  async exportToFile(data) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `telemetry-${timestamp}.json`;
      const filePath = path.join(this.options.logDirectory, filename);
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      
      return filePath;
    } catch (error) {
      console.error('Failed to export telemetry to file:', error);
      throw error;
    }
  }

  // Helper method to measure DNS lookup time
  async measureDnsLookup(hostname) {
    const start = this.performance.now();
    const dns = require('dns');
    const { promisify } = require('util');
    const lookup = promisify(dns.lookup);
    
    try {
      await lookup(hostname);
      const duration = this.performance.now() - start;
      return Math.round(duration * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error(`DNS lookup failed for ${hostname}:`, error);
      return -1;
    }
  }
}

module.exports = Telemetry;
