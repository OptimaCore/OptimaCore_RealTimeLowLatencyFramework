import { useState, useCallback } from 'react';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';
import { tracer } from '../telemetry/tracing';

interface ErrorResponse {
  message: string;
  [key: string]: any;
}

interface ApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchData: (config: AxiosRequestConfig, spanName?: string) => Promise<T | null>;
}

const useApi = <T>(): ApiResponse<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (
    config: AxiosRequestConfig,
    spanName: string = 'api-request'
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);
    
    // Create a new span for this API call
    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        // Add trace headers to the request
        const headers = {
          ...config.headers,
          'x-request-id': span.spanContext().traceId,
        };

        // Set span attributes
        span.setAttributes({
          'http.method': config.method?.toUpperCase() || 'GET',
          'http.url': config.url || '',
          'http.request.body': config.data ? JSON.stringify(config.data) : undefined,
        });

        // Make the API call
        const response = await axios({
          ...config,
          headers,
          validateStatus: () => true, // Don't throw on HTTP error status
        });

        // Update span with response information
        span.setAttributes({
          'http.status_code': response.status,
          'http.response.body': JSON.stringify(response.data).substring(0, 2000), // Limit size
        });

        if (response.status >= 200 && response.status < 300) {
          setData(response.data);
          span.setStatus({ code: SpanStatusCode.OK });
          return response.data;
        } else {
          const errorData = response.data as ErrorResponse;
          const errorMessage = errorData?.message || `HTTP error ${response.status}`;
          setError(errorMessage);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
          return null;
        }
      } catch (err) {
        const axiosError = err as AxiosError;
        const errorData = axiosError.response?.data as ErrorResponse | undefined;
        const errorMessage = errorData?.message || axiosError.message;
        
        setError(errorMessage);
        
        // Record the error in the span
        span.recordException({
          name: 'API Error',
          message: errorMessage,
          stack: axiosError.stack,
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        
        return null;
      } finally {
        setLoading(false);
        span.end();
      }
    });
  }, []);

  return { data, loading, error, fetchData };
};

export default useApi;
