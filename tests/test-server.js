require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const authRoutes = require('../src/api/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logger } = require('../services/telemetry');

// Load environment variables with defaults
const {
  PORT = 3000,
  HOST = '0.0.0.0',
  NODE_ENV = 'development',
  ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001',
  ALLOWED_METHODS = 'GET,POST,PUT,DELETE,OPTIONS',
  ALLOWED_HEADERS = 'Content-Type,Authorization',
  TEST_USER_EMAIL = 'test@example.com',
  TEST_USER_PASSWORD = 'password123',
  TEST_USER_ROLES = 'user,admin'
} = process.env;

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: ALLOWED_ORIGINS.split(',').map(origin => origin.trim()),
  methods: ALLOWED_METHODS.split(',').map(method => method.trim()),
  allowedHeaders: ALLOWED_HEADERS.split(',').map(header => header.trim()),
  credentials: true
}));

// Routes
app.use('/api/auth', authRoutes);

// Test protected route
app.get('/api/protected', requireAuth, (req, res) => {
  res.json({
    message: 'Access granted',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles
    }
  });
});

// Test admin route
app.get('/api/admin', requireRole('admin'), (req, res) => {
  res.json({
    message: 'Admin access granted',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('API Error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`Test server running in ${NODE_ENV} mode on http://${HOST}:${PORT}`);
  console.log('\nTest endpoints:');
  console.log(`POST   /api/auth/login`);
  console.log(`POST   /api/auth/refresh`);
  console.log(`POST   /api/auth/logout`);
  console.log(`GET    /api/protected (requires auth)`);
  console.log(`GET    /api/admin (requires admin role)`);
  
  if (NODE_ENV !== 'production') {
    console.log('\nTest credentials:');
    console.log(`Email: ${TEST_USER_EMAIL}`);
    console.log(`Password: ${TEST_USER_PASSWORD}`);
    console.log(`Roles: ${TEST_USER_ROLES}`);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
