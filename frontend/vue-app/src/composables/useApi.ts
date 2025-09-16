import { ref } from 'vue';
import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { trace, context, type Span, SpanStatusCode } from '@opentelemetry/api';
import { tracer } from '@/telemetry/tracing';

interface ApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (config: AxiosRequestConfig, spanName?: string) => Promise<T | null>;
}

export function useApi<T>() {
  const data = ref<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const execute = async (
    config: AxiosRequestConfig,
    spanName: string = 'api-request'
  ): Promise<T | null> => {
    loading.value = true;
    error.value = null;
    
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
          baseURL: import.meta.env.VITE_API_URL || '/api',
          headers,
          validateStatus: () => true, // Don't throw on HTTP error status
        });

        // Update span with response information
        span.setAttributes({
          'http.status_code': response.status,
          'http.response.body': JSON.stringify(response.data).substring(0, 2000), // Limit size
        });

        if (response.status >= 200 && response.status < 300) {
          data.value = response.data;
          span.setStatus({ code: SpanStatusCode.OK });
          return response.data;
        } else {
          const errorMessage = response.data?.message || `HTTP error ${response.status}`;
          error.value = errorMessage;
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
          return null;
        }
      } catch (err) {
        const axiosError = err as AxiosError;
        const errorMessage = axiosError.response?.data?.message || axiosError.message;
        
        error.value = errorMessage as string;
        
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
        loading.value = false;
        span.end();
      }
    });
  };

  return { data, loading, error, execute };
}
