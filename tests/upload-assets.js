import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { FormData } from 'https://jslib.k6.io/formdata/1.0.2/index.js';

// Configuration
const config = {
  baseUrl: __ENV.BASE_URL || 'http://localhost:3000',
  authToken: __ENV.AUTH_TOKEN || '',
  testDuration: __ENV.TEST_DURATION || '1m',
  vus: __ENV.VUS || 10,
  testFiles: [
    { name: 'small-image.jpg', size: '100KB', type: 'image/jpeg' },
    { name: 'medium-image.jpg', size: '5MB', type: 'image/jpeg' },
    { name: 'large-video.mp4', size: '50MB', type: 'video/mp4' },
    { name: 'document.pdf', size: '2MB', type: 'application/pdf' }
  ]
};

// Custom metrics
const errorRate = new Rate('errors');
const uploadDuration = {
  min: 0,
  max: 0,
  avg: 0,
  p90: 0,
  p95: 0,
  p99: 0
};

// Generate test files in memory
function generateTestFile(size) {
  const sizes = {
    '100KB': 100 * 1024,
    '1MB': 1024 * 1024,
    '5MB': 5 * 1024 * 1024,
    '10MB': 10 * 1024 * 1024,
    '50MB': 50 * 1024 * 1024,
    '100MB': 100 * 1024 * 1024
  };
  
  const bufferSize = sizes[size] || sizes['1MB'];
  const buffer = new Uint8Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

// Pre-generate test files
const testFiles = new SharedArray('test_files', function() {
  return config.testFiles.map(file => ({
    ...file,
    data: generateTestFile(file.size)
  }));
});

export const options = {
  scenarios: {
    upload_scenario: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: config.vus }, // Ramp up to target VUs
        { duration: config.testDuration, target: config.vus }, // Stay at target VUs for test duration
        { duration: '30s', target: 0 } // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.1'], // Less than 10% of requests should fail
  },
};

export default function () {
  // Select a random test file
  const testFile = testFiles[randomIntBetween(0, testFiles.length - 1)];
  const fileName = testFile.name;
  const fileData = testFile.data;
  const fileType = testFile.type;
  
  // Create form data
  const formData = new FormData();
  formData.append('file', http.file(fileData, fileName, fileType));
  
  // Add metadata
  formData.append('metadata', JSON.stringify({
    testId: __VU,
    iteration: __ITER,
    timestamp: new Date().toISOString(),
    fileSize: fileData.length,
    fileType
  }));
  
  // Set headers
  const params = {
    headers: {
      'Authorization': `Bearer ${config.authToken}`,
      'X-Test-Id': `test-${__VU}-${__ITER}`,
      'X-File-Size': fileData.length,
      'X-File-Type': fileType,
      ...formData.headers
    },
    timeout: '300s', // Increased timeout for large files
    tags: {
      file_type: fileType.split('/')[0],
      file_size: testFile.size,
      scenario: 'upload'
    }
  };
  
  // Execute upload
  const startTime = new Date();
  const res = http.post(`${config.baseUrl}/api/assets/upload`, formData.body(), params);
  const endTime = new Date();
  const duration = endTime - startTime;
  
  // Update metrics
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has url': (r) => r.json().url !== undefined
  });
  
  if (!success) {
    errorRate.add(1);
    console.error(`Upload failed: ${res.status} - ${res.body}`);
  } else {
    errorRate.add(0);
    
    // Update duration metrics
    uploadDuration.min = uploadDuration.min === 0 ? duration : Math.min(uploadDuration.min, duration);
    uploadDuration.max = Math.max(uploadDuration.max, duration);
    uploadDuration.avg = (uploadDuration.avg * (__ITER) + duration) / (__ITER + 1);
    
    // Calculate percentiles (simplified for this example)
    // In a real scenario, you'd collect all durations and calculate properly
    if (duration > uploadDuration.p90) uploadDuration.p90 = duration * 0.9;
    if (duration > uploadDuration.p95) uploadDuration.p95 = duration * 0.95;
    if (duration > uploadDuration.p99) uploadDuration.p99 = duration * 0.99;
    
    // Log successful upload
    console.log(`Uploaded ${fileName} (${(fileData.length / (1024 * 1024)).toFixed(2)} MB) in ${duration}ms`);
  }
  
  // Add a small delay between iterations
  sleep(randomIntBetween(1, 3));
}

export function handleSummary(data) {
  // Calculate additional metrics
  const totalRequests = data.metrics.http_reqs.values.count;
  const failedRequests = data.metrics.http_req_failed.values.passes;
  const successRate = ((totalRequests - failedRequests) / totalRequests) * 100;
  
  // Generate a summary
  const summary = {
    test_configuration: {
      base_url: config.baseUrl,
      duration: config.testDuration,
      virtual_users: config.vus,
      test_files: config.testFiles.map(f => `${f.name} (${f.size})`)
    },
    results: {
      total_requests: totalRequests,
      success_rate: `${successRate.toFixed(2)}%`,
      error_rate: `${(100 - successRate).toFixed(2)}%`,
      total_data_uploaded: `${(data.metrics.data_sent.values.count / (1024 * 1024)).toFixed(2)} MB`,
      total_data_downloaded: `${(data.metrics.data_received.values.count / (1024 * 1024)).toFixed(2)} MB`,
      requests_per_second: data.metrics.http_reqs.values.rate.toFixed(2),
      upload_duration_ms: {
        min: uploadDuration.min.toFixed(2),
        max: uploadDuration.max.toFixed(2),
        avg: uploadDuration.avg.toFixed(2),
        p90: uploadDuration.p90.toFixed(2),
        p95: uploadDuration.p95.toFixed(2),
        p99: uploadDuration.p99.toFixed(2)
      },
      http_status_codes: data.metrics['http_req_duration{expected_response:true}'].values.statuses || {}
    },
    recommendations: []
  };
  
  // Add recommendations based on results
  if (successRate < 90) {
    summary.recommendations.push('Investigate the high error rate. Check server logs for failed requests.');
  }
  
  if (uploadDuration.avg > 5000) {
    summary.recommendations.push('Upload performance is slow. Consider optimizing file processing or increasing server resources.');
  }
  
  // Save summary to file
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryFile = `./reports/upload-test-summary-${date}.json`;
  
  // Ensure reports directory exists
  try {
    const fs = require('fs');
    if (!fs.existsSync('./reports')) {
      fs.mkdirSync('./reports', { recursive: true });
    }
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`Test summary saved to ${summaryFile}`);
  } catch (error) {
    console.error('Failed to save test summary:', error);
  }
  
  return {
    stdout: `\n===== UPLOAD TEST SUMMARY =====\n` +
      `Test completed at: ${new Date().toISOString()}\n` +
      `Success Rate: ${summary.results.success_rate}\n` +
      `Total Requests: ${summary.results.total_requests}\n` +
      `Data Uploaded: ${summary.results.total_data_uploaded} MB\n` +
      `Avg. Upload Time: ${summary.results.upload_duration_ms.avg} ms\n` +
      `Max Upload Time: ${summary.results.upload_duration_ms.max} ms\n` +
      `\nRecommendations:\n${summary.recommendations.length > 0 ? summary.recommendations.join('\n') : 'No critical issues detected.'}\n`
  };
}
