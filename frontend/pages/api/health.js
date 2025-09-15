// Simple health check endpoint for the frontend
export default function handler(req, res) {
  res.status(200).json({
    status: 'UP',
    service: 'frontend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
}
