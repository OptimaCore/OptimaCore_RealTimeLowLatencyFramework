const express = require('express');
const cors = require('cors');
const { mockApi } = require('./src/api/mockApi');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get('/products/:id', async (req, res) => {
  try {
    const product = await mockApi.getProduct(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/cart', async (req, res) => {
  try {
    const result = await mockApi.addToCart(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/products/:id/related', async (req, res) => {
  try {
    const relatedProducts = await mockApi.getRelatedProducts(req.params.id);
    res.json(relatedProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/products/:id/reviews', async (req, res) => {
  try {
    const reviews = await mockApi.getProductReviews(req.params.id);
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});

module.exports = app;
