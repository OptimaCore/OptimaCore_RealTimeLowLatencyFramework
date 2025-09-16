const express = require('express');
const router = express.Router();
const jwt = require('../../services/auth/jwt');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { logger } = require('../../services/telemetry');

// Login route
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR'
      });
    }
    
    // Mock user lookup - replace with actual database query
    const user = {
      id: 'user-123',
      email,
      roles: ['user'],
      permissions: ['read:profile']
    };
    
    // Generate tokens
    const tokens = await jwt.generateTokens(user);
    
    // Log successful login
    logger.info('User logged in', { userId: user.id, email: user.email });
    
    // Set HTTP-only cookie for refresh token
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Return access token in response body
    res.json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType
    });
  } catch (error) {
    logger.error('Login failed', { error: error.message });
    next(error);
  }
});

// Refresh token route
router.post('/refresh', async (req, res, next) => {
  try {
    // Get refresh token from cookie or Authorization header
    const refreshToken = req.cookies.refreshToken || 
      (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token is required',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }
    
    // Refresh the access token
    const tokens = await jwt.refreshAccessToken(refreshToken);
    
    // Set HTTP-only cookie for new refresh token
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Return new access token
    res.json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType
    });
  } catch (error) {
    logger.error('Token refresh failed', { error: error.message });
    res.status(401).json({
      error: 'Invalid or expired refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  // Clear the refresh token cookie
  res.clearCookie('refreshToken');
  
  // In a real app, you might want to invalidate the refresh token
  // by adding it to a blacklist in your database
  
  res.json({ message: 'Successfully logged out' });
});

// Protected route example
router.get('/protected', requireAuth, (req, res) => {
  res.json({
    message: 'Access granted',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles
    }
  });
});

// Admin route example (requires admin role)
router.get('/admin', requireRole('admin'), (req, res) => {
  res.json({
    message: 'Admin access granted',
    user: {
      id: req.user.id,
      email: req.user.email,
      roles: req.user.roles
    }
  });
});

module.exports = router;
