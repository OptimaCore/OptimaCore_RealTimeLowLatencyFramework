const { execSync } = require('child_process');
const axios = require('axios');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3000/api',
  testProductId: '1',
  testTimeout: 10000, // 10 seconds
};

// Test suite
describe('End-to-End Integration Tests', function() {
  this.timeout(CONFIG.testTimeout);

  // Start the application before tests
  before(async function() {
    console.log('Starting the application...');
    try {
      // Start the React development server in the background
      this.serverProcess = execSync('npm start', { 
        cwd: path.join(__dirname, '../../frontend/react-app'),
        stdio: 'ignore',
        detached: true,
      });

      // Wait for the server to be ready
      await waitForServer(CONFIG.baseUrl);
      console.log('Application is ready for testing');
    } catch (error) {
      console.error('Failed to start the application:', error);
      process.exit(1);
    }
  });

  // Stop the application after tests
  after(function() {
    console.log('Stopping the application...');
    // Kill the server process
    if (this.serverProcess) {
      try {
        process.kill(-this.serverProcess.pid);
      } catch (error) {
        console.error('Error stopping server:', error);
      }
    }
  });

  // Test cases
  describe('Product Page', function() {
    it('should load the product page', async function() {
      const response = await axios.get(`${CONFIG.baseUrl}/product/${CONFIG.testProductId}`);
      expect(response.status).to.equal(200);
      expect(response.data).to.include('Premium Wireless Headphones');
    });

    it('should fetch product data from the API', async function() {
      const response = await axios.get(`${CONFIG.apiUrl}/products/${CONFIG.testProductId}`);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('id', CONFIG.testProductId);
      expect(response.data).to.have.property('name');
      expect(response.data).to.have.property('price');
    });
  });

  describe('Cart Functionality', function() {
    it('should add a product to the cart', async function() {
      const cartData = {
        productId: CONFIG.testProductId,
        color: 'Black',
        size: 'M',
        quantity: 1,
      };

      const response = await axios.post(`${CONFIG.apiUrl}/cart`, cartData);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property('success', true);
      expect(response.data).to.have.property('cartId');
      expect(response.data).to.have.property('item');
    });
  });

  describe('Accessibility', function() {
    it('should have proper HTML structure', async function() {
      const response = await axios.get(`${CONFIG.baseUrl}/product/${CONFIG.testProductId}`);
      const html = response.data;
      
      // Check for required elements
      expect(html).to.include('<h1'); // Page title
      expect(html).to.include('<img'); // Product image
      expect(html).to.include('$'); // Price
      
      // Check for accessibility attributes
      expect(html).to.match(/<img[^>]*alt="/); // Images have alt text
      expect(html).to.include('aria-label'); // Interactive elements have labels
    });
  });

  describe('Performance', function() {
    it('should load the product page within 2 seconds', async function() {
      this.timeout(5000); // Increase timeout for this test
      
      const startTime = Date.now();
      await axios.get(`${CONFIG.baseUrl}/product/${CONFIG.testProductId}`);
      const loadTime = Date.now() - startTime;
      
      console.log(`Page loaded in ${loadTime}ms`);
      expect(loadTime).to.be.lessThan(2000);
    });
  });
});

// Helper function to wait for the server to be ready
async function waitForServer(url, maxAttempts = 10, delay = 1000) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      await axios.get(url);
      return true; // Server is ready
    } catch (error) {
      if (attempts % 5 === 0) {
        console.log(`Waiting for server to start... (attempt ${attempts + 1}/${maxAttempts})`);
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Server did not start after ${maxAttempts} attempts`);
}

// Run the tests
if (require.main === module) {
  const Mocha = require('mocha');
  
  // Configure Mocha
  const mocha = new Mocha({
    timeout: 30000, // 30 seconds
    reporter: 'spec',
    color: true,
  });
  
  // Add test files
  mocha.addFile(__filename);
  
  // Run tests
  mocha.run(failures => {
    process.exitCode = failures ? 1 : 0;
  });
}
