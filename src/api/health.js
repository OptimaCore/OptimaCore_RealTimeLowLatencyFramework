const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const redis = require('redis');

// Health check endpoint
router.get('/health', async (req, res) => {
  const healthcheck = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    checks: {
      api: { status: 'UP' },
      database: { status: 'DOWN' },
      redis: { status: 'DOWN' },
    },
  };

  try {
    // Check PostgreSQL connection
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    await pool.query('SELECT 1');
    healthcheck.checks.database.status = 'UP';
    await pool.end();
  } catch (error) {
    healthcheck.checks.database.error = error.message;
    healthcheck.status = 'DEGRADED';
  }

  try {
    // Check Redis connection
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
    });
    
    await redisClient.connect();
    await redisClient.ping();
    healthcheck.checks.redis.status = 'UP';
    await redisClient.quit();
  } catch (error) {
    healthcheck.checks.redis.error = error.message;
    healthcheck.status = 'DEGRADED';
  }

  // If any critical service is down, set overall status to DOWN
  if (healthcheck.checks.database.status === 'DOWN') {
    healthcheck.status = 'DOWN';
  }

  const statusCode = healthcheck.status === 'UP' ? 200 : 503;
  return res.status(statusCode).json(healthcheck);
});

// Simple ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
