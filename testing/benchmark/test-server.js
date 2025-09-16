const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for testing
const storage = {
  redis: {},
  cosmos: {},
  postgres: {},
  blob: {}
};

// Simulate different response times based on storage type
const simulateLatency = (type) => {
  const latencies = {
    redis: Math.random() * 5 + 1,       // 1-6ms
    cosmos: Math.random() * 50 + 20,    // 20-70ms
    postgres: Math.random() * 30 + 10,  // 10-40ms
    blob: Math.random() * 100 + 50,     // 50-150ms
  };
  return new Promise(resolve => setTimeout(resolve, latencies[type] || 10));
};

// Benchmark endpoint
app.post('/api/benchmark', async (req, res) => {
  const { userId, payload, variant = 'hierarchical' } = req.body;
  const requestId = req.body.requestId || uuidv4();
  
  // Determine storage backend based on variant
  let storageBackend;
  let cacheHit = false;
  
  switch (variant.toLowerCase()) {
    case 'hierarchical':
      // Check cache first
      if (storage.redis[userId]) {
        storageBackend = 'redis';
        cacheHit = true;
      } else {
        storageBackend = 'postgres';
        storage.redis[userId] = payload; // Populate cache
      }
      break;
      
    case 'distributed':
      storageBackend = 'cosmos';
      break;
      
    case 'hybrid':
      storageBackend = Math.random() > 0.3 ? 'redis' : 'postgres';
      cacheHit = storageBackend === 'redis';
      break;
      
    default:
      storageBackend = 'postgres';
  }
  
  // Simulate storage operation latency
  await simulateLatency(storageBackend);
  
  // Store the data
  storage[storageBackend][userId] = payload;
  
  // Add some jitter
  await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
  
  // Prepare response
  res.set({
    'X-Storage-Source': storageBackend,
    'X-Cache-Hit': cacheHit,
    'X-Request-Id': requestId
  });
  
  res.json({
    success: true,
    requestId,
    storage: storageBackend,
    cacheHit,
    timestamp: new Date().toISOString(),
    data: payload
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Benchmark server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  POST   /api/benchmark  - Run benchmark test`);
  console.log(`  GET    /health         - Health check`);
});

module.exports = app;
