const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const jwt = require('../services/auth/jwt');
const keyvault = require('../services/secrets/keyvault');
const { app, startServer, stopServer } = require('../app'); // Assuming you have an app.js that exports the Express app

// Mock user data for testing
const testUser = {
  id: uuidv4(),
  email: 'test@example.com',
  roles: ['user'],
  permissions: ['read:profile']
};

// Test tokens
let validAccessToken;
let expiredAccessToken;
let refreshToken;

// Setup and teardown
beforeAll(async () => {
  // Start the server
  await startServer();
  
  // Generate test tokens
  const tokens = await jwt.generateTokens(testUser);
  validAccessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  
  // Generate an expired token for testing
  expiredAccessToken = jwt.sign(
    {
      sub: testUser.id,
      email: testUser.email,
      roles: testUser.roles,
      jti: uuidv4(),
      iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      exp: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
      iss: 'OptimaCore',
      aud: 'optima-client'
    },
    await keyvault.getSecret('jwt-private-key'),
    {
      algorithm: 'RS256',
      keyid: await keyvault.getSecret('jwt-key-id') || 'test-key-id'
    }
  );
});

afterAll(async () => {
  // Stop the server
  await stopServer();
});

describe('Authentication', () => {
  describe('Token Generation', () => {
    test('should generate valid access and refresh tokens', async () => {
      const tokens = await jwt.generateTokens(testUser);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(15 * 60); // 15 minutes in seconds
    });
  });

  describe('Token Verification', () => {
    test('should verify a valid token', async () => {
      const { valid, payload } = await jwt.verifyToken(validAccessToken);
      
      expect(valid).toBe(true);
      expect(payload).toHaveProperty('sub', testUser.id);
      expect(payload).toHaveProperty('email', testUser.email);
      expect(payload.roles).toEqual(expect.arrayContaining(testUser.roles));
    });

    test('should reject an expired token', async () => {
      const { valid, error } = await jwt.verifyToken(expiredAccessToken);
      
      expect(valid).toBe(false);
      expect(error).toContain('jwt expired');
    });

    test('should reject an invalid token', async () => {
      const { valid, error } = await jwt.verifyToken('invalid.token.here');
      
      expect(valid).toBe(false);
      expect(error).toBeDefined();
    });
  });

  describe('Token Refresh', () => {
    test('should refresh a valid refresh token', async () => {
      const newTokens = await jwt.refreshAccessToken(refreshToken);
      
      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
      
      // Verify the new access token
      const { valid, payload } = await jwt.verifyToken(newTokens.accessToken);
      expect(valid).toBe(true);
      expect(payload.sub).toBe(testUser.id);
    });

    test('should reject an invalid refresh token', async () => {
      await expect(jwt.refreshAccessToken('invalid.token.here'))
        .rejects
        .toThrow('Invalid refresh token');
    });
  });

  describe('Protected Routes', () => {
    test('should allow access with a valid token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${validAccessToken}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message', 'Access granted');
    });

    test('should deny access without a token', async () => {
      const response = await request(app)
        .get('/api/protected');
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('should deny access with an expired token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredAccessToken}`);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid or expired token');
    });
  });

  describe('Role-Based Access Control', () => {
    test('should allow access with required role', async () => {
      const adminUser = {
        ...testUser,
        roles: ['admin']
      };
      
      const { accessToken } = await jwt.generateTokens(adminUser);
      
      const response = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message', 'Admin access granted');
    });

    test('should deny access without required role', async () => {
      const response = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${validAccessToken}`);
      
      expect(response.statusCode).toBe(403);
      expect(response.body).toHaveProperty('error', 'Insufficient permissions');
    });
  });
});

describe('Key Vault Integration', () => {
  test('should retrieve a secret from Key Vault', async () => {
    const secretName = 'test-secret';
    const secretValue = 'test-secret-value';
    
    // Set a test secret
    await keyvault.setSecret(secretName, secretValue);
    
    // Retrieve the secret
    const retrievedValue = await keyvault.getSecret(secretName);
    
    expect(retrievedValue).toBe(secretValue);
    
    // Clean up
    await keyvault.deleteSecret(secretName);
  });

  test('should handle missing secrets gracefully', async () => {
    const nonExistentSecret = await keyvault.getSecret('non-existent-secret', {
      throwIfNotFound: false
    });
    
    expect(nonExistentSecret).toBeNull();
  });
});

// Test server setup
if (process.env.NODE_ENV !== 'test') {
  // This block is for manual testing
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
    
    // Log test tokens
    console.log('\nTest tokens:');
    console.log(`Access Token: ${validAccessToken}`);
    console.log(`Refresh Token: ${refreshToken}`);
    console.log(`Expired Token: ${expiredAccessToken}\n`);
    
    console.log('Test CURL commands:');
    console.log(`curl -H "Authorization: Bearer ${validAccessToken}" http://localhost:${PORT}/api/protected`);
    console.log(`curl -H "Authorization: Bearer ${expiredAccessToken}" http://localhost:${PORT}/api/protected`);
  });
}
