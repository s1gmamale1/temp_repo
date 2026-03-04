// auth.middleware.js - Authentication middleware for Fastify
const { verifyAccessToken, verifyAgentToken, checkRateLimit, hashToken } = require('./auth.service');

/**
 * Main authentication middleware
 * Validates Bearer token and attaches user to request
 */
async function authenticateToken(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for Authorization header
    if (!authHeader) {
      reply.code(401);
      return { error: 'NO_TOKEN', message: 'Authorization header required' };
    }
    
    // Check Bearer format
    if (!authHeader.startsWith('Bearer ')) {
      reply.code(401);
      return { error: 'INVALID_FORMAT', message: 'Authorization must be Bearer token' };
    }
    
    const token = authHeader.substring(7);
    
    // Validate token length
    if (token.length !== 64) {
      reply.code(401);
      return { error: 'INVALID_TOKEN', message: 'Token format invalid' };
    }
    
    // Rate limiting
    const tokenHash = hashToken(token);
    const rateLimit = checkRateLimit(tokenHash, 100, 60000); // 100 req/min
    
    if (!rateLimit.allowed) {
      reply.code(429);
      reply.header('X-RateLimit-Remaining', 0);
      reply.header('X-RateLimit-Reset', rateLimit.resetAt);
      return { error: 'RATE_LIMITED', message: 'Too many requests. Try again later.' };
    }
    
    // Verify token
    const userData = await verifyAccessToken(token);
    
    if (!userData) {
      reply.code(401);
      return { error: 'EXPIRED_OR_REVOKED', message: 'Token expired or revoked. Please login again.' };
    }
    
    // Attach user to request
    req.user = {
      id: userData.userId,
      role: userData.role,
      name: userData.name,
      email: userData.email,
      tokenId: userData.tokenId
    };
    
    // Add rate limit headers
    reply.header('X-RateLimit-Remaining', rateLimit.remaining);
    reply.header('X-RateLimit-Reset', rateLimit.resetAt);
    
  } catch (error) {
    console.error('Authentication error:', error);
    reply.code(500);
    return { error: 'AUTH_ERROR', message: 'Authentication system error' };
  }
}

/**
 * Agent authentication middleware
 * Validates Agent token for agent-specific endpoints
 */
async function authenticateAgent(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      reply.code(401);
      return { error: 'NO_TOKEN', message: 'Authorization header required' };
    }
    
    // Check for Agent token format
    if (authHeader.startsWith('Agent ')) {
      const token = authHeader.substring(6);
      
      const agentData = await verifyAgentToken(token);
      
      if (!agentData) {
        reply.code(401);
        return { error: 'INVALID_AGENT_TOKEN', message: 'Agent token expired or invalid' };
      }
      
      req.agent = {
        id: agentData.agentId,
        name: agentData.name,
        role: agentData.role,
        isAgent: true
      };
      
      return;
    }
    
    // Fallback to regular Bearer token
    if (authHeader.startsWith('Bearer ')) {
      return authenticateToken(req, reply);
    }
    
    reply.code(401);
    return { error: 'INVALID_FORMAT', message: 'Use "Bearer <token>" or "Agent <token>"' };
    
  } catch (error) {
    console.error('Agent authentication error:', error);
    reply.code(500);
    return { error: 'AUTH_ERROR', message: 'Authentication system error' };
  }
}

/**
 * Optional authentication - attaches user if token valid, continues either way
 */
async function optionalAuth(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return;
    }
    
    const token = authHeader.substring(7);
    const userData = await verifyAccessToken(token);
    
    if (userData) {
      req.user = {
        id: userData.userId,
        role: userData.role,
        name: userData.name,
        email: userData.email
      };
    } else {
      req.user = null;
    }
    
  } catch (error) {
    req.user = null;
  }
}

/**
 * Role-based access control middleware factory
 */
function requireRole(...allowedRoles) {
  return async function(req, reply) {
    // Ensure authentication ran first
    if (!req.user) {
      reply.code(401);
      return { error: 'NOT_AUTHENTICATED', message: 'Authentication required' };
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      reply.code(403);
      return { 
        error: 'INSUFFICIENT_PERMISSIONS', 
        message: `Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
      };
    }
  };
}

/**
 * Admin-only middleware
 */
const requireAdmin = requireRole('admin');

/**
 * Admin or manager middleware
 */
const requireAdminOrManager = requireRole('admin', 'manager');

/**
 * Admin or agent middleware
 */
const requireAdminOrAgent = requireRole('admin', 'agent');

module.exports = {
  authenticateToken,
  authenticateAgent,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireAdminOrManager,
  requireAdminOrAgent
};
