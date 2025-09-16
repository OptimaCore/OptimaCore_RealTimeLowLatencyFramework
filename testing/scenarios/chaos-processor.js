// Chaos engineering processor for Artillery
// This module provides chaos engineering capabilities for load testing

const { v4: uuidv4 } = require('uuid');

// Track active chaos configurations
let activeChaosConfigs = new Map();

// Initialize chaos configuration
function initChaos() {
  return {
    // Network latency configuration
    networkLatency: {
      enabled: false,
      minDelay: 0,
      maxDelay: 0,
      errorRate: 0
    },
    // Error injection configuration
    errorInjection: {
      enabled: false,
      errorRate: 0,
      statusCodes: []
    },
    // Active requests
    activeRequests: new Map()
  };
}

// Get or create chaos config for a virtual user
function getOrCreateChaosConfig(userContext, events, next) {
  if (!userContext.vars.chaos) {
    userContext.vars.chaos = initChaos();
  }
  next();
}

// Apply chaos before scenario execution
function chaosBeforeScenario(userContext, events, next) {
  const { chaos } = userContext.vars;
  
  // Apply network latency if enabled
  if (chaos.networkLatency?.enabled) {
    const delay = Math.random() * 
      (chaos.networkLatency.maxDelay - chaos.networkLatency.minDelay) + 
      chaos.networkLatency.minDelay;
    
    setTimeout(() => {
      next();
    }, delay);
    return;
  }
  
  next();
}

// Apply chaos after response is received
function chaosAfterResponse(requestParams, response, userContext, events, next) {
  const { chaos } = userContext.vars;
  const requestId = response.req?.getHeader('x-request-id') || uuidv4();
  
  // Track request start time for latency calculation
  if (!chaos.activeRequests.has(requestId)) {
    chaos.activeRequests.set(requestId, {
      startTime: Date.now(),
      url: requestParams.url
    });
  }
  
  const requestInfo = chaos.activeRequests.get(requestId);
  
  // Calculate actual latency
  const latency = Date.now() - requestInfo.startTime;
  
  // Emit custom metrics
  events.emit('histogram', 'chaos.latency', latency);
  events.emit('counter', 'chaos.requests', 1);
  
  // Apply error injection if enabled
  if (chaos.errorInjection?.enabled && 
      Math.random() < chaos.errorInjection.errorRate) {
    const statusCode = chaos.errorInjection.statusCodes[
      Math.floor(Math.random() * chaos.errorInjection.statusCodes.length)
    ];
    
    events.emit('counter', 'chaos.errors_injected', 1);
    
    // Replace the response with an error
    response.statusCode = statusCode;
    response.body = JSON.stringify({
      error: 'Chaos Engineering: Injected Error',
      requestId,
      timestamp: new Date().toISOString(),
      chaos: {
        type: 'error_injection',
        statusCode,
        originalUrl: requestInfo.url
      }
    });
    
    response.headers = response.headers || {};
    response.headers['Content-Type'] = 'application/json';
    response.headers['X-Chaos-Engineered'] = 'true';
  }
  
  // Clean up
  chaos.activeRequests.delete(requestId);
  
  next();
}

// Processor function for Artillery
function processor(script, events) {
  // Initialize metrics
  events.on('stats', (stats) => {
    // Reset active chaos configs for new phase
    if (stats.period === 0) {
      activeChaosConfigs.clear();
    }
  });
  
  // Add chaos configuration to each scenario
  script.scenarios.forEach((scenario) => {
    // Find the phase this scenario belongs to
    const phase = script.config.phases.find(p => p.name === scenario.flow[0]?.phase);
    
    if (phase?.chaos) {
      // Apply chaos configuration
      scenario.beforeScenario = 'chaosBeforeScenario';
      scenario.afterResponse = 'chaosAfterResponse';
      
      // Store chaos configuration
      activeChaosConfigs.set(scenario.name, {
        networkLatency: phase.chaos.networkLatency,
        errorInjection: phase.chaos.errorInjection
      });
    }
  });
  
  return script;
}

// Export the processor and helper functions
module.exports = {
  processor,
  chaosBeforeScenario,
  chaosAfterResponse,
  getOrCreateChaosConfig,
  initChaos
};
