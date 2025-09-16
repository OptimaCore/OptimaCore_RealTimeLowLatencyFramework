const { createProxyMiddleware } = require('http-proxy-middleware');
const mockApi = require('./api/mockApi');

module.exports = function(app) {
  // Proxy API requests to mock API
  app.use('/api', (req, res, next) => {
    // Handle specific API endpoints
    if (req.method === 'GET' && req.path.startsWith('/products/')) {
      const productId = req.path.split('/').pop();
      return mockApi.getProduct(productId)
        .then(product => res.json(product))
        .catch(error => res.status(404).json({ error: error.message }));
    }
    
    if (req.method === 'POST' && req.path === '/cart') {
      return mockApi.addToCart(req.body)
        .then(result => res.json(result))
        .catch(error => res.status(500).json({ error: error.message }));
    }
    
    // Default 404 for undefined routes
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Development proxy for API (if needed)
  if (process.env.REACT_APP_API_URL) {
    app.use(
      '/api',
      createProxyMiddleware({
        target: process.env.REACT_APP_API_URL,
        changeOrigin: true,
        pathRewrite: {
          '^/api': '', // Remove /api prefix when proxying
        },
        onProxyReq: (proxyReq, req) => {
          // Add any required headers for the API
          proxyReq.setHeader('x-request-id', req.id || 'dev-request');
        },
      })
    );
  }
};
