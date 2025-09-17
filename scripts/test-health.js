const { healthService } = require('../services/health');

// Load environment variables
require('dotenv').config();

// Configuration with defaults
const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',  // Listen on all interfaces for containerization
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
};

// Start the health service
const server = healthService.start(config.port, config.host, () => {
  const protocol = config.nodeEnv === 'production' ? 'https' : 'http';
  const hostname = config.host === '0.0.0.0' ? 'localhost' : config.host;
  const port = config.port === 80 || config.port === 443 ? '' : `:${config.port}`;
  const baseUrl = config.nodeEnv === 'production' 
    ? config.baseUrl 
    : `${protocol}://${hostname}${port}`;
    
  console.log(`Health service running in ${config.nodeEnv} mode`);
  console.log(`- Health check: ${baseUrl}/health`);
  console.log(`- Readiness check: ${baseUrl}/ready`);
  console.log(`- Metrics: ${baseUrl}/metrics`);
  
  if (config.nodeEnv === 'development') {
    console.log('\nDevelopment mode:');
    console.log(`- Local: http://localhost:${config.port}`);
    console.log(`- Network: http://${require('os').hostname()}:${config.port}`);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Health service stopped');
    process.exit(0);
  });});
