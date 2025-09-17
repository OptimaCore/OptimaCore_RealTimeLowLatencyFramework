require('dotenv').config({ path: '.env.development' });
const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');

// Initialize Express app
const app = express();

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
async function testDbConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', res.rows[0]);
    return true;
  } catch (err) {
    console.error('Database connection error:', err);
    return false;
  }
}

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  enableOfflineQueue: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('Redis client connected');});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testDbConnection();
  const redisStatus = redis.status === 'ready' ? 'connected' : 'disconnected';
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    services: {
      database: dbStatus ? 'connected' : 'disconnected',
      redis: redisStatus,
    },
  });
});

// Example database query endpoint
app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Example Redis cache endpoint
app.get('/cache/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const value = await redis.get(key);
    if (value) {
      res.json({ key, value: JSON.parse(value), fromCache: true });
    } else {
      // Simulate setting a value if not found
      const newValue = { data: `Value for ${key}`, timestamp: new Date().toISOString() };
      await redis.set(key, JSON.stringify(newValue), 'EX', 3600); // Cache for 1 hour
      res.json({ key, value: newValue, fromCache: false });
    }
  } catch (err) {
    console.error('Redis error:', err);
    res.status(500).json({ error: 'Cache error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, async () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test database connection on startup
  await testDbConnection();
});

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await pool.end();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await pool.end();
  await redis.quit();
  process.exit(0);
});

module.exports = app;
