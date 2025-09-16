/*
 * k6 load test script for OptimaCore
 * For documentation: https://k6.io/docs/
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
import { Counter } from 'k6/metrics';
import { Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TEST_ENV = __ENV.TEST_ENV || 'local';
const TEST_TYPE = __ENV.TEST_TYPE || 'smoke';

// Custom metrics
const errorRate = new Rate('errors');
const requestCount = new Counter('request_count');
const requestDuration = new Trend('request_duration');

// Test data
const testUsers = new SharedArray('test_users', function() {
  return JSON.parse(open('./test-data/users.json'));
});

// Common HTTP parameters
const params = {
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'k6-load-test',
    'X-Test-Environment': TEST_ENV,
    'X-Test-Type': TEST_TYPE,
  },
  tags: {
    test_type: TEST_TYPE,
    environment: TEST_ENV,
  },
};

// Test configuration
export const options = {
  // Test scenarios
  scenarios: {
    smoke_test: {
      executor: 'constant-vus',
      exec: 'smokeTest',
      vus: 1,
      duration: '1m',
    },
    load_test: {
      executor: 'ramping-vus',
      exec: 'loadTest',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    stress_test: {
      executor: 'ramping-arrival-rate',
      exec: 'stressTest',
      preAllocatedVUs: 50,
      timeUnit: '1s',
      stages: [
        { target: 10, duration: '30s' },
        { target: 50, duration: '1m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
  discardResponseBodies: false,
  noConnectionReuse: true,
};

// Helper functions
function handleResponse(response, requestName) {
  const success = check(response, {
    [`${requestName} status was 200`]: (r) => r.status === 200,
    [`${requestName} response time < 1000ms`]: (r) => r.timings.duration < 1000,
  });

  if (!success) {
    errorRate.add(1);
    console.error(`Request failed: ${requestName}`, response.body);
  } else {
    errorRate.add(0);
  }

  requestCount.add(1, { endpoint: requestName });
  requestDuration.add(response.timings.duration, { endpoint: requestName });

  return success ? response : null;
}

// Test scenarios
export function smokeTest() {
  const healthResponse = http.get(`${BASE_URL}/health`, params);
  handleResponse(healthResponse, 'health_check');
  sleep(1);
}

export function loadTest() {
  // Get a random test user
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // 1. Login
  const loginResponse = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      username: user.username,
      password: user.password,
    }),
    params
  );
  
  const loginSuccess = handleResponse(loginResponse, 'login');
  
  if (loginSuccess) {
    const token = loginResponse.json('token');
    params.headers['Authorization'] = `Bearer ${token}`;
    
    // 2. Make authenticated requests
    const profileResponse = http.get(`${BASE_URL}/api/profile`, params);
    handleResponse(profileResponse, 'get_profile');
    
    // 3. Simulate user behavior
    if (Math.random() > 0.7) {
      const updateResponse = http.put(
        `${BASE_URL}/api/profile`,
        JSON.stringify({ lastActive: new Date().toISOString() }),
        params
      );
      handleResponse(updateResponse, 'update_profile');
    }
  }
  
  sleep(Math.random() * 2 + 1); // Random sleep between 1-3s
}

export function stressTest() {
  // Similar to loadTest but with more aggressive parameters
  loadTest();
}

// Setup and teardown
export function setup() {
  console.log(`Starting load test against: ${BASE_URL}`);
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log(`Test completed. Start time: ${data.startTime}`);
  console.log(`Total requests: ${requestCount.values['count'] || 0}`);
  console.log(`Error rate: ${errorRate.values['rate'] || 0}%`);
}

// Default execution
export default function () {
  loadTest();
}
