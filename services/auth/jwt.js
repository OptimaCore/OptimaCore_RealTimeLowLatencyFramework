const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const keyvault = require('../secrets/keyvault');
const { logger } = require('../../services/telemetry');

class JWTService {
  constructor() {
    this.algorithm = 'RS256';
    this.issuer = 'OptimaCore';
    this.audience = 'optima-client';
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
    this.privateKey = null;
    this.publicKey = null;
    this.keyId = null;
  }

  async initialize() {
    try {
      // Try to get keys from Key Vault first
      this.privateKey = await keyvault.getSecret('jwt-private-key');
      this.publicKey = await keyvault.getSecret('jwt-public-key');
      this.keyId = await keyvault.getSecret('jwt-key-id') || 'default-key-id';
      
      // If keys don't exist in Key Vault, generate new ones
      if (!this.privateKey || !this.publicKey) {
        logger.warn('No JWT keys found in Key Vault, using development keys');
        await this.generateDevelopmentKeys();
      }
      
      logger.info('JWT service initialized');
    } catch (error) {
      logger.error('Failed to initialize JWT service', { error: error.message });
      throw error;
    }
  }

  async generateDevelopmentKeys() {
    // In production, you should use proper key management
    const crypto = require('crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.keyId = 'dev-key-id';
    
    logger.warn('Using development JWT keys. DO NOT use in production!');
  }

  async generateTokens(user) {
    const jti = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles || [],
        jti,
        iat: now,
        exp: now + (15 * 60), // 15 minutes
        iss: this.issuer,
        aud: this.audience
      },
      this.privateKey,
      {
        algorithm: this.algorithm,
        keyid: this.keyId
      }
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        jti: uuidv4(),
        type: 'refresh',
        iat: now,
        exp: now + (7 * 24 * 60 * 60), // 7 days
        iss: this.issuer,
        aud: this.audience
      },
      this.privateKey,
      {
        algorithm: this.algorithm,
        keyid: this.keyId
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
      tokenType: 'Bearer'
    };
  }

  async verifyToken(token, options = {}) {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: [this.algorithm],
        issuer: this.issuer,
        audience: this.audience,
        ...options
      });
      
      return { valid: true, payload: decoded };
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message });
      return { valid: false, error: error.message };
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      // Verify the refresh token
      const { valid, payload } = await this.verifyToken(refreshToken, {
        ignoreExpiration: false
      });
      
      if (!valid || payload.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }
      
      // Get user data (in a real app, fetch from database)
      const user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles || []
      };
      
      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      logger.error('Failed to refresh token', { error: error.message });
      throw new Error('Invalid refresh token');
    }
  }

  getPublicKey() {
    return this.publicKey;
  }

  getKeyId() {
    return this.keyId;
  }

  // For OIDC/JWKS endpoint
  getPublicKeyForJwks() {
    return {
      kty: 'RSA',  // Key Type
      use: 'sig',   // Signature
      kid: this.keyId,
      alg: this.algorithm,
      n: this.publicKey,
      e: 'AQAB'     // Standard exponent for RSA keys
    };
  }
}

// Create a singleton instance
const jwtService = new JWTService();

// Initialize the service when this module is imported
jwtService.initialize().catch(error => {
  logger.error('Failed to initialize JWT service', { error: error.message });
  process.exit(1);
});

module.exports = jwtService;
