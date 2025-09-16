import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import { tracer } from '@/telemetry/tracing';

// Mock the OpenTelemetry tracer
vi.mock('@/telemetry/tracing', () => ({
  tracer: {
    startActiveSpan: vi.fn((name, callback) => {
      const span = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
        spanContext: () => ({ traceId: 'mock-trace-id' })
      };
      return callback(span);
    })
  }
}));

// Mock axios
vi.mock('axios', () => ({
  default: vi.fn((config) => {
    if (config.url?.includes('error')) {
      return Promise.reject({
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        },
        message: 'Request failed'
      });
    }
    
    return Promise.resolve({
      status: 200,
      data: { id: '1', name: 'Test Item' },
      config
    });
  })
}));

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes a successful API call', async () => {
    const { data, loading, error, execute } = useApi();
    
    // Initial state
    expect(loading.value).toBe(false);
    expect(data.value).toBeNull();
    expect(error.value).toBeNull();
    
    // Execute API call
    const promise = execute({
      method: 'GET',
      url: '/api/items/1'
    });
    
    // Loading state should be true during request
    expect(loading.value).toBe(true);
    
    // Wait for the request to complete
    await promise;
    
    // Verify the response
    expect(loading.value).toBe(false);
    expect(data.value).toEqual({ id: '1', name: 'Test Item' });
    expect(error.value).toBeNull();
    
    // Verify telemetry was called
    expect(tracer.startActiveSpan).toHaveBeenCalledWith(
      'api-request',
      expect.any(Function)
    );
  });
  
  it('handles API errors', async () => {
    const { error, execute } = useApi();
    
    // Execute failing API call
    await execute({
      method: 'GET',
      url: '/api/error'
    });
    
    // Verify error handling
    expect(error.value).toBe('Internal Server Error');
    
    // Verify telemetry error handling
    const span = {
      recordException: expect.any(Function),
      setStatus: expect.any(Function),
      end: expect.any(Function)
    };
    
    expect(span.recordException).toHaveBeenCalledWith({
      name: 'API Error',
      message: 'Internal Server Error',
      stack: expect.any(String)
    });
    
    expect(span.setStatus).toHaveBeenCalledWith({
      code: 2, // ERROR
      message: 'Internal Server Error'
    });
  });
  
  it('includes trace headers in requests', async () => {
    const { execute } = useApi();
    
    await execute({
      method: 'GET',
      url: '/api/items/1'
    });
    
    // Get the axios mock call
    const axios = (await import('axios')).default;
    const callConfig = axios.mock.calls[0][0];
    
    // Verify trace header was added
    expect(callConfig.headers['x-request-id']).toBe('mock-trace-id');
  });
  
  it('allows custom span names', async () => {
    const { execute } = useApi();
    
    await execute(
      { method: 'GET', url: '/api/items/1' },
      'custom-span-name'
    );
    
    expect(tracer.startActiveSpan).toHaveBeenCalledWith(
      'custom-span-name',
      expect.any(Function)
    );
  });
});
