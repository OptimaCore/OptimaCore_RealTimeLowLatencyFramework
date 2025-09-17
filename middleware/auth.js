const jwt = require('../services/auth/jwt');
const { logger } = require('../services/telemetry');

// Load environment variables with defaults
const {
  NODE_ENV = 'development',
  AUTH_REQUIRED = 'true',
  AUTH_DEBUG = 'false'
} = process.env;

// Convert string booleans to actual booleans
const isAuthRequired = AUTH_REQUIRED === 'true';
const isDebugMode = AUTH_DEBUG === 'true' || NODE_ENV !== 'production';

/**
 * Authentication middleware that verifies JWT tokens
 */
const authenticate = (options = {}) => {
  const {
    required = isAuthRequired,
    roles = [],
    permissions = []
  } = options;

  return async (req, res, next) => {
    // Skip authentication if it's not required
    if (!required) {
      return next();
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      if (required) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      return next();
    }

    try {
      // Verify the token
      const { valid, payload, error } = await jwt.verifyToken(token, {
        ignoreExpiration: false
      });

      if (!valid) {
        logger.warn('Invalid token', { error });
        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }

      // Check if token is a refresh token (not allowed for regular auth)
      if (payload.type === 'refresh') {
        return res.status(401).json({
          error: 'Refresh tokens cannot be used for authentication',
          code: 'INVALID_TOKEN_TYPE'
        });
      }

      // Check roles if specified
      if (roles.length > 0) {
        const userRoles = payload.roles || [];
        const hasRole = roles.some(role => userRoles.includes(role));
        
        if (!hasRole) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS',
            requiredRoles: roles,
            userRoles
          });
        }
      }

      // Check permissions if specified
      if (permissions.length > 0) {
        const userPermissions = payload.permissions || [];
        const hasPermission = permissions.every(perm => userPermissions.includes(perm));
        
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS',
            requiredPermissions: permissions,
            userPermissions
          });
        }
      }

      // Attach user to request object
      req.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        jti: payload.jti,
        token: token
      };

      // Log successful authentication (debug level in production)
      const logData = {
        userId: req.user.id,
        email: req.user.email,
        roles: req.user.roles,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        method: req.method
      };
      
      if (isDebugMode) {
        logger.debug('User authenticated', logData);
      } else {
        logger.info('User authenticated', { userId: req.user.id });
      }

      next();
    } catch (error) {
      logger.error('Authentication error', { error: error.message });
      return res.status(401).json({
        error: 'Authentication failed',
        code: 'AUTH_FAILED',
        details: error.message
      });
    }
  };
};

/**
 * Middleware to require authentication for specific routes
 */
const requireAuth = (options = {}) => {
  return authenticate({ ...options, required: true });
};

/**
 * Middleware for optional authentication
 */
const optionalAuth = (options = {}) => {
  return authenticate({ ...options, required: false });
};

/**
 * Middleware to require specific roles
 */
const requireRole = (...roles) => {
  return authenticate({ required: true, roles });
};

/**
 * Middleware to require specific permissions
 */
const requirePermission = (...permissions) => {
  return authenticate({ required: true, permissions });
};

module.exports = {
  authenticate,
  requireAuth,
  optionalAuth,
  requireRole,
  requirePermission
};
