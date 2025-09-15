const { describe, it, expect, beforeAll, beforeEach, jest } = require('@jest/globals');
const Telemetry = require('../services/telemetry');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(),
    writeFile: jest.fn().mockResolvedValue()
  }
}));

// Mock performance API
const mockPerformance = {
  now: jest.fn(),
  mark: jest.fn(),
  measure: jest.fn(),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn()
};

global.performance = mockPerformance;

// Mock dns
jest.mock('dns', () => ({
  lookup: jest.fn((hostname, callback) => 
    process.nextTick(() => callback(null, { address: '127.0.0.1', family: 4 }))
  )
}));

describe('Telemetry Service', () => {
  let telemetry;
  
  beforeAll(() => {
    let time = 0;
    mockPerformance.now.mockImplementation(() => time += 10);
    mockPerformance.measure.mockImplementation(() => ({
      duration: 50,
      entryType: 'measure',
      name: 'test-measure',
      startTime: 0,
      toJSON: () => ({})
    }));
  });
  
  beforeEach(() => {
    telemetry = new Telemetry({
      enableAppInsights: false,
      enableFileLogging: false,
      region: 'test-region'
    });
    jest.clearAllMocks();
  });
  
  it('should initialize with default options', () => {
    expect(telemetry.options.region).toBe('test-region');
    expect(telemetry.options.enableAppInsights).toBe(false);
    expect(telemetry.options.enableFileLogging).toBe(false);
  });
  
  describe('startRequest', () => {
    it('should initialize request context', async () => {
      const context = await telemetry.startRequest();
      expect(context).toHaveProperty('requestId');
      expect(mockPerformance.mark).toHaveBeenCalled();
    });
  });
  
  describe('endRequest', () => {
    let context;
    
    beforeEach(async () => {
      context = await telemetry.startRequest();
      jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 1e6, system: 5e5 });
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        rss: 300 * 1024 * 1024
      });
    });
    
    it('should complete request with valid telemetry', async () => {
      const result = await telemetry.endRequest(context, {
        storageSource: 'ssd',
        cacheHit: true,
        dbType: 'cosmosdb'
      });
      
      expect(result).toMatchObject({
        region: 'test-region',
        storage_source: 'ssd',
        cache_hit: true,
        db_type: 'cosmosdb'
      });
    });
    
    it('should validate against schema', async () => {
      await expect(telemetry.endRequest(context, {
        storageSource: 'invalid',
        cacheHit: 'not-bool',
        dbType: 123
      })).rejects.toThrow();
    });
  });
  
  it('should measure DNS lookup', async () => {
    const duration = await telemetry.measureDnsLookup('example.com');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
