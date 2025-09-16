/**
 * Artillery Helper Functions
 * 
 * This file contains utility functions for Artillery load tests.
 * These functions can be used in test scenarios for setup, teardown,
 * and custom logic.
 */

// Global variables and state
const state = {
  authTokens: new Map(),
  testStartTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
};

/**
 * Before test hook
 */
function beforeTest() {
  console.log(`\n🚀 Starting load test at ${new Date().toISOString()}`);
  console.log(`Environment: ${this.vars.environment || 'local'}`);
  console.log(`Scenario: ${this.scenarioName || 'default'}`);
}

/**
 * After test hook
 */
function afterTest() {
  const duration = (Date.now() - state.testStartTime) / 1000;
  console.log('\n🏁 Test completed');
  console.log(`⏱  Duration: ${duration.toFixed(2)} seconds`);
  console.log(`📊 Total requests: ${state.requestCount}`);
  console.log(`❌ Errors: ${state.errorCount}`);
  console.log(`✅ Success rate: ${Math.max(0, 100 - (state.errorCount / Math.max(1, state.requestCount)) * 100).toFixed(2)}%`);
}

/**
 * Before scenario hook
 */
function beforeScenario(events, testContext) {
  state.requestCount = 0;
  state.errorCount = 0;
  testContext.vars.testStartTime = Date.now();
  
  // Set default headers
  testContext.vars.headers = {
    'Content-Type': 'application/json',
    'X-Test-Id': `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    'X-Test-Environment': testContext.vars.environment || 'local',
  };
}

/**
 * After scenario hook
 */
function afterScenario(events, testContext) {
  const scenarioDuration = (Date.now() - testContext.vars.testStartTime) / 1000;
  console.log(`\n📊 Scenario completed: ${testContext.scenarioName || 'unnamed'}`);
  console.log(`⏱  Duration: ${scenarioDuration.toFixed(2)}s`);
  console.log(`📊 Requests: ${state.requestCount}`);
  console.log(`❌ Errors: ${state.errorCount}`);
  
  // Clean up any resources
  if (testContext.vars.userId) {
    state.authTokens.delete(testContext.vars.userId);
  }
}

/**
 * Before request hook
 */
function beforeRequest(requestParams, context, ee, next) {
  state.requestCount++;
  context.vars.requestStartTime = Date.now();
  
  // Add authentication token if available
  if (context.vars.token) {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers.Authorization = `Bearer ${context.vars.token}`;
  }
  
  // Add correlation ID for tracing
  requestParams.headers['X-Correlation-Id'] = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  return next();
}

/**
 * After response hook
 */
function afterResponse(requestParams, response, context, ee, next) {
  const duration = Date.now() - context.vars.requestStartTime;
  const url = new URL(requestParams.url, 'http://localhost');
  
  // Log slow requests
  if (duration > 1000) { // 1 second threshold
    console.warn(`⚠️  Slow request: ${requestParams.method} ${url.pathname} (${duration}ms)`);
  }
  
  // Handle errors
  if (response.statusCode >= 400) {
    state.errorCount++;
    console.error(`❌ Error ${response.statusCode} on ${requestParams.method} ${url.pathname}`);
    if (response.body) {
      try {
        const error = JSON.parse(response.body);
        console.error(`   ${error.message || 'No error details'}`);
      } catch (e) {
        console.error(`   ${response.body.substring(0, 200)}...`);
      }
    }
  }
  
  // Extract token from login response
  if (url.pathname.endsWith('/auth/login') && response.statusCode === 200) {
    try {
      const body = JSON.parse(response.body);
      if (body.token) {
        context.vars.token = body.token;
        
        // Store token for future use if we have a user ID
        if (context.vars.userId) {
          state.authTokens.set(context.vars.userId, body.token);
        }
      }
    } catch (e) {
      console.error('Failed to parse login response:', e);
    }
  }
  
  return next();
}

/**
 * Set authentication token for the current user
 */
function setAuthToken(userContext, events, done) {
  if (userContext.vars.userId && state.authTokens.has(userContext.vars.userId)) {
    userContext.vars.token = state.authTokens.get(userContext.vars.userId);
  }
  return done();
}

/**
 * Generate WebSocket payload
 */
function generateWsPayload(userContext, events, done) {
  userContext.vars.payload = JSON.stringify({
    type: 'ping',
    timestamp: Date.now(),
    userId: userContext.vars.userId || 'anonymous',
  });
  return done();
}

// Export all functions
module.exports = {
  beforeTest,
  afterTest,
  beforeScenario,
  afterScenario,
  beforeRequest,
  afterResponse,
  setAuthToken,
  generateWsPayload,
  
  // For testing purposes
  _state: state,
};
