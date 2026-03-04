// auth.service.js - Token-based authentication service
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');

// Token configuration
const TOKEN_CONFIG = {
  access: { expiryMinutes: 15, type: 'access' },
  refresh: { expiryDays: 7, type: 'refresh' },
  agent: { expiryHours: 24, type: 'agent' }
};

// Rate limiting store (in-memory, per token)
const rateLimitStore = new Map();

/**
 * Generate a random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new token pair (access + refresh)
 */
async function createTokenPair(userId) {
  const db = getDb();
  
  const accessToken = generateToken();
  const refreshToken = generateToken();
  
  const accessHash = hashToken(accessToken);
  const refreshHash = hashToken(refreshToken);
  
  // Store access token (15 min expiry)
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token_type, token_hash, expires_at)
    VALUES (?, ?, 'access', ?, datetime('now', '+15 minutes'))
  `).run(uuidv4(), userId, accessHash);
  
  // Store refresh token (7 days expiry)
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token_type, token_hash, expires_at)
    VALUES (?, ?, 'refresh', ?, datetime('now', '+7 days'))
  `).run(uuidv4(), userId, refreshHash);
  
  return { accessToken, refreshToken };
}

/**
 * Create an agent token (24 hour expiry)
 */
async function createAgentToken(agentId) {
  const db = getDb();
  
  const token = generateToken();
  const tokenHash = hashToken(token);
  
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token_type, token_hash, expires_at)
    VALUES (?, ?, 'agent', ?, datetime('now', '+24 hours'))
  `).run(uuidv4(), agentId, tokenHash);
  
  return token;
}

/**
 * Verify an access token
 */
async function verifyAccessToken(token) {
  const db = getDb();
  const tokenHash = hashToken(token);
  
  const tokenRecord = db.prepare(`
    SELECT t.*, u.id as user_id, u.role, u.name, u.email
    FROM auth_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.token_hash = ? 
    AND t.token_type = 'access'
    AND t.is_revoked = FALSE
    AND t.expires_at > datetime('now')
  `).get(tokenHash);
  
  if (!tokenRecord) {
    return null;
  }
  
  // Update last used
  db.prepare(`
    UPDATE auth_tokens 
    SET last_used_at = datetime('now')
    WHERE id = ?
  `).run(tokenRecord.id);
  
  return {
    userId: tokenRecord.user_id,
    role: tokenRecord.role,
    name: tokenRecord.name,
    email: tokenRecord.email,
    tokenId: tokenRecord.id
  };
}

/**
 * Verify a refresh token and return new token pair
 */
async function refreshAccessToken(refreshToken) {
  const db = getDb();
  const tokenHash = hashToken(refreshToken);
  
  const tokenRecord = db.prepare(`
    SELECT t.*, u.id as user_id
    FROM auth_tokens t
    JOIN users u ON t.user_id = u.id
    WHERE t.token_hash = ? 
    AND t.token_type = 'refresh'
    AND t.is_revoked = FALSE
    AND t.expires_at > datetime('now')
  `).get(tokenHash);
  
  if (!tokenRecord) {
    return null;
  }
  
  // Revoke old refresh token
  db.prepare(`
    UPDATE auth_tokens SET is_revoked = TRUE WHERE id = ?
  `).run(tokenRecord.id);
  
  // Revoke old access tokens for this user
  db.prepare(`
    UPDATE auth_tokens 
    SET is_revoked = TRUE 
    WHERE user_id = ? 
    AND token_type = 'access'
    AND is_revoked = FALSE
  `).run(tokenRecord.user_id);
  
  // Create new token pair
  return createTokenPair(tokenRecord.user_id);
}

/**
 * Verify an agent token
 */
async function verifyAgentToken(token) {
  const db = getDb();
  const tokenHash = hashToken(token);
  
  const tokenRecord = db.prepare(`
    SELECT t.*, a.id as agent_id, a.name as agent_name, a.role as agent_role
    FROM auth_tokens t
    JOIN manager_agents a ON t.user_id = a.id
    WHERE t.token_hash = ? 
    AND t.token_type = 'agent'
    AND t.is_revoked = FALSE
    AND t.expires_at > datetime('now')
  `).get(tokenHash);
  
  if (!tokenRecord) {
    return null;
  }
  
  // Update last used
  db.prepare(`
    UPDATE auth_tokens 
    SET last_used_at = datetime('now')
    WHERE id = ?
  `).run(tokenRecord.id);
  
  return {
    agentId: tokenRecord.agent_id,
    name: tokenRecord.agent_name,
    role: tokenRecord.agent_role,
    tokenId: tokenRecord.id
  };
}

/**
 * Revoke all tokens for a user
 */
async function revokeAllUserTokens(userId) {
  const db = getDb();
  
  db.prepare(`
    UPDATE auth_tokens 
    SET is_revoked = TRUE 
    WHERE user_id = ? 
    AND is_revoked = FALSE
  `).run(userId);
  
  return true;
}

/**
 * Revoke a specific token
 */
async function revokeToken(tokenId) {
  const db = getDb();
  
  db.prepare(`
    UPDATE auth_tokens 
    SET is_revoked = TRUE 
    WHERE id = ?
  `).run(tokenId);
  
  return true;
}

/**
 * Check rate limit for a token
 */
function checkRateLimit(tokenHash, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const requests = rateLimitStore.get(tokenHash) || [];
  const recentRequests = requests.filter(t => t > windowStart);
  
  if (recentRequests.length >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: requests[0] + windowMs };
  }
  
  recentRequests.push(now);
  rateLimitStore.set(tokenHash, recentRequests);
  
  return { 
    allowed: true, 
    remaining: maxRequests - recentRequests.length,
    resetAt: now + windowMs
  };
}

/**
 * Cleanup expired tokens (run periodically)
 */
async function cleanupExpiredTokens() {
  const db = getDb();
  
  // Delete tokens expired more than 1 day ago
  const result = db.prepare(`
    DELETE FROM auth_tokens 
    WHERE expires_at < datetime('now', '-1 day')
  `).run();
  
  console.log(`🧹 Cleaned up ${result.changes} expired tokens`);
  return result.changes;
}

module.exports = {
  generateToken,
  hashToken,
  createTokenPair,
  createAgentToken,
  verifyAccessToken,
  refreshAccessToken,
  verifyAgentToken,
  revokeAllUserTokens,
  revokeToken,
  checkRateLimit,
  cleanupExpiredTokens
};
