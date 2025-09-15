const { healthService } = require('../services/health');

// Start the health service
const port = process.env.PORT || 3000;
const server = healthService.start(port, () => {
  console.log(`Health service running on http://localhost:${port}`);
  console.log(`- Health check: http://localhost:${port}/health`);
  console.log(`- Readiness check: http://localhost:${port}/ready`);
  console.log(`- Metrics: http://localhost:${port}/metrics`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Health service stopped');
    process.exit(0);
  });});
