const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MetricsCollector } = require('../monitoring/metrics-collector');
const appInsights = require('applicationinsights');

// Mock dependencies
jest.mock('@azure/applicationinsights');

describe('Metrics Collector', () => {
  let collector;

  beforeAll(() => {
    // Set up test environment
    process.env.APP_INSIGHTS_KEY = 'test-key';
    process.env.PROMETHEUS_PORT = '9464';
  });

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize successfully', () => {
    expect(collector).toBeDefined();
    expect(collector.appInsightsKey).toBe('test-key');
    expect(collector.prometheusPort).toBe('9464');
  });

  test('should initialize App Insights client', () => {
    expect(collector.appInsightsClient).toBeDefined();
    expect(collector.appInsightsClient).toBe(appInsights.defaultClient);
  });

  test('should collect metrics', async () => {
    const mockMetrics = {
      timestamp: new Date().toISOString(),
      requestLatency: 100,
      cacheHitRatio: 0.8,
      ruConsumption: 200,
      activeConnections: 10,
      errorCount: 0
    };

    collector.simulateMetricCollection = jest.fn().mockResolvedValue(mockMetrics);
    collector.exportToAppInsights = jest.fn().mockResolvedValue(undefined);

    await collector.collectMetrics();

    expect(collector.simulateMetricCollection).toHaveBeenCalled();
    expect(collector.exportToAppInsights).toHaveBeenCalledWith(mockMetrics);
  });

  test('should export metrics to Application Insights', async () => {
    const mockMetrics = {
      timestamp: new Date().toISOString(),
      requestLatency: 100,
      cacheHitRatio: 0.8,
      ruConsumption: 200,
      activeConnections: 10,
      errorCount: 0
    };

    collector.simulateMetricCollection = jest.fn().mockResolvedValue(mockMetrics);
    collector.exportToAppInsights = jest.fn().mockResolvedValue(undefined);

    await collector.collectMetrics();

    expect(collector.simulateMetricCollection).toHaveBeenCalled();
    expect(collector.exportToAppInsights).toHaveBeenCalledWith(mockMetrics);
  });

  test('should handle collection errors', async () => {
    const error = new Error('Collection failed');
    collector.simulateMetricCollection = jest.fn().mockRejectedValue(error);

    console.error = jest.fn();
    await collector.collectMetrics();

    expect(console.error).toHaveBeenCalledWith('Error collecting metrics:', error);
  });
});

describe('Alert Rules', () => {
  test('alert rules file exists', () => {
    const alertRulesPath = path.join(__dirname, '../alerts/alert-rules.json');
    expect(fs.existsSync(alertRulesPath)).toBe(true);
  });

  test('alert runbook exists', () => {
    const runbookPath = path.join(__dirname, '../monitoring/alert-runbook.md');
    expect(fs.existsSync(runbookPath)).toBe(true);
  });
});

describe('Dashboard Configuration', () => {
  test('dashboard configuration exists', () => {
    const dashboardPath = path.join(__dirname, '../monitoring/optima-dashboard.json');
    expect(fs.existsSync(dashboardPath)).toBe(true);
  });
});
