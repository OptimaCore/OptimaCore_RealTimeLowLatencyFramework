import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Initialize the tracer provider
const provider = new WebTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'optima-frontend-vue',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    'deployment.environment': import.meta.env.MODE || 'development',
  }),
});

// Configure the OTLP exporter
const collectorUrl = import.meta.env.VITE_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const exporter = new OTLPTraceExporter({
  url: collectorUrl,
  headers: {},
});

// Add the exporter to the provider
provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Register the provider
provider.register({
  contextManager: new ZoneContextManager(),
});

// Register instrumentations
registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new XMLHttpRequestInstrumentation({
      propagateTraceHeaderCorsUrls: [
        /http:\/\/localhost:3000/, // Local API
        /https?:\/\/api\.optima\.com/, // Production API
      ],
      clearTimingResources: true,
    }),
  ],
});

// Export the tracer
const tracer = provider.getTracer('optima-vue-app');

export { tracer, provider };
