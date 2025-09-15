const { ApplicationInsightsClient } = require('@azure/monitor-query');
const { DefaultAzureCredential } = require('@azure/identity');
const { v4: uuidv4 } = require('uuid');

class AppInsightsExporter {
  constructor(options = {}) {
    this.options = {
      connectionString: process.env.APPINSIGHTS_CONNECTION_STRING,
      workspaceId: process.env.APPINSIGHTS_WORKSPACE_ID,
      ...options
    };
    
    this.client = null;
    this.initialized = false;
    this.batch = [];
    this.batchSize = 100;
    this.flushInterval = 60000; // 1 minute
    this.flushTimer = null;
    
    // Initialize in the next tick to allow event listeners to be set up
    process.nextTick(() => this.initialize());
  }
  
  async initialize() {
    if (!this.options.connectionString && !this.options.workspaceId) {
      console.warn('AppInsights: No connection string or workspace ID provided. Running in no-op mode.');
      return;
    }
    
    try {
      const credential = new DefaultAzureCredential();
      this.client = new ApplicationInsightsClient(credential, {
        endpoint: this.options.endpoint || 'https://api.applicationinsights.azure.com'
      });
      
      this.initialized = true;
      console.log('AppInsights: Initialized successfully');
      
      // Setup periodic flush
      this.setupFlushTimer();
    } catch (error) {
      console.error('AppInsights: Failed to initialize:', error);
      this.initialized = false;
    }
  }
  
  setupFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    
    // Ensure we flush on process exit
    process.on('beforeExit', () => this.flushSync());
    process.on('SIGINT', () => {
      this.flushSync();
      process.exit(0);
    });
  }
  
  trackMetric(name, value, properties = {}) {
    if (!this.initialized) return;
    
    const timestamp = new Date();
    const metric = {
      name,
      value,
      timestamp,
      properties: {
        ...properties,
        'cloud.role': this.options.roleName || 'default',
        'cloud.roleInstance': this.options.roleInstance || os.hostname()
      }
    };
    
    this.batch.push(metric);
    
    // Flush if batch size is reached
    if (this.batch.length >= this.batchSize) {
      this.flush().catch(console.error);
    }
  }
  
  trackRequest(requestData) {
    if (!this.initialized) return;
    
    const { name, url, duration, resultCode, success, properties } = requestData;
    
    this.trackMetric('Request', duration, {
      'RequestName': name,
      'RequestUrl': url,
      'ResponseCode': resultCode,
      'Success': success,
      ...properties
    });
  }
  
  trackDependency(dependencyData) {
    if (!this.initialized) return;
    
    const { name, type, target, duration, success, resultCode, properties } = dependencyData;
    
    this.trackMetric('Dependency', duration, {
      'DependencyType': type,
      'DependencyName': name,
      'DependencyTarget': target,
      'Success': success,
      'ResultCode': resultCode,
      ...properties
    });
  }
  
  async flush() {
    if (!this.initialized || this.batch.length === 0) return;
    
    const batchToSend = [...this.batch];
    this.batch = [];
    
    try {
      // In a real implementation, we would send the batch to App Insights
      // This is a simplified example
      console.log(`AppInsights: Flushing ${batchToSend.length} metrics`);
      
      // Here you would typically use the App Insights client to send the metrics
      // For example:
      // await this.client.track(batchToSend);
      
      return true;
    } catch (error) {
      console.error('AppInsights: Failed to flush metrics:', error);
      
      // Requeue the batch if it fails
      this.batch.unshift(...batchToSend);
      return false;
    }
  }
  
  flushSync() {
    if (!this.initialized || this.batch.length === 0) return;
    
    console.log(`AppInsights: Synchronously flushing ${this.batch.length} metrics`);
    
    // In a real implementation, you might want to do a synchronous HTTP request here
    // For now, we'll just log and clear the batch
    this.batch = [];
  }
  
  // Query metrics from App Insights
  async queryMetrics(query, timespan = 'PT1H') {
    if (!this.initialized) {
      throw new Error('AppInsights not initialized');
    }
    
    try {
      const result = await this.client.query(
        this.options.workspaceId,
        query,
        { timespan }
      );
      
      return result.tables[0].rows.map(row => {
        const obj = {};
        result.tables[0].columns.forEach((col, index) => {
          obj[col.name] = row[index];
        });
        return obj;
      });
    } catch (error) {
      console.error('AppInsights: Query failed:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const appInsights = new AppInsightsExporter();

module.exports = {
  AppInsightsExporter,
  appInsights,
  
  // Convenience methods that use the singleton instance
  trackMetric: (name, value, properties) => 
    appInsights.trackMetric(name, value, properties),
    
  trackRequest: (requestData) => 
    appInsights.trackRequest(requestData),
    
  trackDependency: (dependencyData) => 
    appInsights.trackDependency(dependencyData),
    
  queryMetrics: (query, timespan) => 
    appInsights.queryMetrics(query, timespan),
    
  flush: () => appInsights.flush(),
  flushSync: () => appInsights.flushSync()
};

// Auto-initialize if this is the main module
if (require.main === module) {
  const exporter = new AppInsightsExporter();
  
  // Example usage
  exporter.trackMetric('TestMetric', 42, { test: 'value' });
  exporter.trackRequest({
    name: 'GET /test',
    url: 'http://localhost:3000/test',
    duration: 123,
    resultCode: 200,
    success: true
  });
  
  // Flush and exit
  setTimeout(() => {
    exporter.flushSync();
    process.exit(0);
  }, 1000);
}
