const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const authRoutes = require('../src/api/auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logger } = require('../services/telemetry');

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
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
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('\nTest endpoints:');
  console.log(`POST   /api/auth/login`);
  console.log(`POST   /api/auth/refresh`);
  console.log(`POST   /api/auth/logout`);
  console.log(`GET    /api/protected (requires auth)`);
  console.log(`GET    /api/admin (requires admin role)`);
  console.log('\nUse the following test credentials:');
  console.log('Email: test@example.com');
  console.log('Password: password123');
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
