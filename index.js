// Load environment variables
require('dotenv').config({ path: '.env.development', debug: true });

const express = require('express');
const configManager = require('./config/config-manager');
const logger = require('./utils/logger');

// Log environment variables for debugging
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  APP_NAME: process.env.APP_NAME,
  PORT: process.env.PORT,
  HOST: process.env.HOST
});

// Get the config from the manager
console.log('Loading configuration...');
const config = configManager.getConfig();
console.log('Configuration loaded:', {
  app: {
    name: config.app?.name,
    env: config.app?.env,
    version: config.app?.version,
    port: config.app?.port,
    host: config.app?.host
  }
});

// Initialize Express app
const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.app.env,
    version: config.app.version
  });
});

// Basic route
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to ${config.app.name}</h1>
    <p>Environment: ${config.app.env}</p>
    <p>Version: ${config.app.version}</p>
    <p>Check the <a href="/health">health endpoint</a> for more information.</p>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start the server
const PORT = config.app.port || 3000;
const HOST = config.app.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Server is running on http://${HOST}:${PORT}`);
  logger.info(`Environment: ${config.app.env}`);
  logger.info(`Version: ${config.app.version}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  // Consider restarting the server or performing cleanup here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  // Consider restarting the server or performing cleanup here
  process.exit(1);
});

// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  // Add cleanup logic here
  process.exit(0);
});

module.exports = app;
