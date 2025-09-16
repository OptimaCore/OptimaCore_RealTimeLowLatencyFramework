#!/usr/bin/env node
const appInsights = require('applicationinsights');
const { DefaultAzureCredential } = require('@azure/identity');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { collectDefaultMetrics } = require('prom-client');
const express = require('express');
const http = require('http');
const config = require('../config/config');

class MetricsCollector {
  constructor() {
    this.appInsightsKey = process.env.APP_INSIGHTS_KEY || config.monitoring.appInsightsKey;
    this.prometheusPort = process.env.PROMETHEUS_PORT || config.monitoring.prometheusPort || 9464;
    this.collectionInterval = process.env.COLLECTION_INTERVAL_MS || 15000;
    this.metrics = {};
    this.appInsightsClient = null;
    this.prometheusExporter = null;
    this.meterProvider = null;

    this.initialize();
  }

  async initialize() {
    try {
      await this.initializeAppInsights();
      this.initializePrometheus();
      this.setupCollection();
      this.startServer();
      console.log('Metrics collector initialized successfully');
    } catch (error) {
      console.error('Failed to initialize metrics collector:', error);
      process.exit(1);
    }
  }

  initializeAppInsights() {
    if (!this.appInsightsKey) {
      console.warn('Application Insights key not provided. App Insights metrics will be disabled.');
      return;
    }

    // Setup Application Insights
    appInsights.setup(this.appInsightsKey)
      .setAutoCollectConsole(false)
      .setAutoCollectDependencies(false)
      .setAutoCollectExceptions(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectRequests(true)
      .setAutoDependencyCorrelation(true)
      .setUseDiskRetryCaching(true)
      .start();

    this.appInsightsClient = appInsights.defaultClient;
  }

  initializePrometheus() {
    // Create Prometheus exporter
    this.prometheusExporter = new PrometheusExporter({
      port: this.prometheusPort
    }, () => {
      console.log(`Prometheus scrape endpoint: http://localhost:${this.prometheusPort}/metrics`);
    });

    // Create meter provider
    this.meterProvider = new MeterProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'optima-metrics-collector',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'optima',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      }),
      exporter: this.prometheusExporter,
      interval: this.collectionInterval,
    });

    // Create meters for different metric types
    this.metrics = {
      latency: this.meterProvider.getMeter('latency').createHistogram('request_latency_ms', {
        description: 'Request latency in milliseconds',
        boundaries: [100, 250, 500, 1000, 2500, 5000],
      }),
      cacheHits: this.meterProvider.getMeter('cache').createCounter('cache_hits_total', {
        description: 'Total number of cache hits',
      }),
      cacheMisses: this.meterProvider.getMeter('cache').createCounter('cache_misses_total', {
        description: 'Total number of cache misses',
      }),
      ruConsumption: this.meterProvider.getMeter('database').createCounter('ru_consumption_total', {
        description: 'Total request units consumed',
      }),
      activeConnections: this.meterProvider.getMeter('database').createObservableGauge('active_connections', {
        description: 'Number of active database connections',
      }),
      errorRate: this.meterProvider.getMeter('errors').createCounter('error_count', {
        description: 'Total number of errors',
      }),
    };

    // Collect default Node.js metrics
    collectDefaultMetrics({
      register: this.prometheusExporter.register,
      timeout: this.collectionInterval,
    });
  }

  setupCollection() {
    // Simulate metrics collection - replace with actual collection logic
    setInterval(() => this.collectMetrics(), this.collectionInterval);
  }

  async collectMetrics() {
    try {
      const metrics = await this.simulateMetricCollection();
      this.processMetrics(metrics);
      await this.exportToAppInsights(metrics);
    } catch (error) {
      console.error('Error collecting metrics:', error);
      this.metrics.errorRate.add(1);
    }
  }

  async simulateMetricCollection() {
    // Replace with actual metric collection logic
    return {
      timestamp: new Date().toISOString(),
      requestLatency: Math.random() * 1000, // 0-1000ms
      cacheHitRatio: 0.7 + Math.random() * 0.3, // 70-100%
      ruConsumption: Math.floor(Math.random() * 1000), // 0-1000 RUs
      activeConnections: Math.floor(Math.random() * 50), // 0-50 connections
      errorCount: Math.floor(Math.random() * 5), // 0-5 errors
    };
  }

  processMetrics(metrics) {
    // Record metrics in Prometheus
    this.metrics.latency.record(metrics.requestLatency);
    this.metrics.ruConsumption.add(metrics.ruConsumption);
    this.metrics.activeConnections.record(metrics.activeConnections);
    
    // Calculate cache hits/misses based on hit ratio
    const totalRequests = 100; // Sample size
    const hits = Math.floor(totalRequests * metrics.cacheHitRatio);
    const misses = totalRequests - hits;
    
    this.metrics.cacheHits.add(hits);
    this.metrics.cacheMisses.add(misses);
    this.metrics.errorRate.add(metrics.errorCount);
  }

  exportToAppInsights(metrics) {
    if (!this.appInsightsClient) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        // Track metrics as custom metrics
        this.appInsightsClient.trackMetric({
          name: 'RequestLatency',
          value: metrics.requestLatency,
          properties: {
            source: 'metrics-collector',
            variant: process.env.DEPLOYMENT_VARIANT || 'unknown'
          }
        });

        this.appInsightsClient.trackMetric({
          name: 'CacheHitRatio',
          value: metrics.cacheHitRatio * 100, // Convert to percentage
          properties: {
            source: 'metrics-collector',
            variant: process.env.DEPLOYMENT_VARIANT || 'unknown'
          }
        });

        this.appInsightsClient.trackMetric({
          name: 'RUConsumption',
          value: metrics.ruConsumption,
          properties: {
            source: 'metrics-collector',
            variant: process.env.DEPLOYMENT_VARIANT || 'unknown'
          }
        });

        this.appInsightsClient.trackMetric({
          name: 'ActiveConnections',
          value: metrics.activeConnections,
          properties: {
            source: 'metrics-collector',
            variant: process.env.DEPLOYMENT_VARIANT || 'unknown'
          }
        });

        // Flush the client to ensure data is sent
        this.appInsightsClient.flush({
          callback: (response) => {
            if (response && response.statusCode !== 200) {
              console.error('Failed to send metrics to Application Insights:', response.statusCode, response.statusMessage);
            }
            resolve();
          }
        });
      } catch (error) {
        console.error('Error exporting to Application Insights:', error);
        resolve();
      }
    });
  }

  startServer() {
    const app = express();
    const server = http.createServer(app);
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: Object.keys(this.metrics),
      });
    });

    // Metrics endpoint for Prometheus
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.prometheusExporter.contentType);
        res.end(await this.prometheusExporter.exportMetrics());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    server.listen(process.env.PORT || 3000, () => {
      console.log(`Metrics collector running on port ${server.address().port}`);
    });
  }
}

// Start the collector
if (require.main === module) {
  const collector = new MetricsCollector();
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
  });
}

module.exports = { MetricsCollector };
