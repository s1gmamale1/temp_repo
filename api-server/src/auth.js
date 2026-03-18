/**
 * Enhanced User Authentication & Session Management
 * Added: Password hashing, user registration, admin middleware
 */

const { getDb, generateId } = require('./database');
const crypto = require('crypto');
const bcryptjs = require('bcryptjs');

const SESSION_DURATION_HOURS = 24;
const BCRYPT_ROUNDS = 12;

// ============================================================================
// PASSWORD UTILITIES (Simple bcrypt-like implementation)
// ============================================================================

/**
 * Hash a password using PBKDF2
 * Note: In production, use bcrypt or argon2
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `$2b$${BCRYPT_ROUNDS}$${salt}$${hash}`;
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password, hash) {
  if (!hash || !hash.includes('$')) return false;

  const parts = hash.split('$');
  if (parts.length < 4) return false;

  const salt = parts[3];
  const expectedHash = parts[4];

  const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return computedHash === expectedHash;
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Create a new user
 */
async function createUser(userData) {
  const db = getDb();
  const { name, telegram_id, email, login, password, role = 'user', avatar_url } = userData;

  // Check if login already exists
  if (login) {
    const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
    if (existing) {
      throw new Error('Login already exists');
    }
  }

  const id = generateId();
  const now = new Date().toISOString();
  const passwordHash = password ? hashPassword(password) : null;

  db.prepare(`
    INSERT INTO users (id, name, telegram_id, email, login, password_hash, role, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, telegram_id || null, email || null, login || null, passwordHash, role, avatar_url || null, now, now);

  return {
    id,
    name,
    telegram_id,
    email,
    login,
    role,
    avatar_url,
    created_at: now
  };
}

/**
 * Register a new user with login/password
 */
async function registerUser(userData) {
  const db = getDb();
  const { login, password, name, email, role = 'user' } = userData;

  if (!login || !password) {
    throw new Error('Login and password are required');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  // Check if login exists
  const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
  if (existing) {
    throw new Error('Login already exists');
  }

  return createUser({
    name: name || login,
    login,
    password,
    email,
    role
  });
}

/**
 * Authenticate user by login/password
 */
async function authenticateUser(login, password) {
  const db = getDb();

  if (!login || !password) {
    throw new Error('Login and password required');
  }

  // Find user by login
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password
  if (!user.password_hash) {
    throw new Error('Password not set for this user');
  }

  const validPassword = bcryptjs.compareSync(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid credentials');
  }

  return {
    id: user.id,
    name: user.name,
    login: user.login,
    email: user.email,
    telegram_id: user.telegram_id,
    role: user.role,
    avatar_url: user.avatar_url
  };
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const db = getDb();
  return db.prepare('SELECT id, name, login, email, telegram_id, role, avatar_url, created_at FROM users WHERE id = ?').get(userId);
}

/**
 * Get user by login
 */
async function getUserByLogin(login) {
  const db = getDb();
  return db.prepare('SELECT id, name, login, email, telegram_id, role, avatar_url, created_at FROM users WHERE login = ?').get(login);
}

/**
 * List all users (admin only)
 */
async function listUsers(filters = {}) {
  const db = getDb();
  const { role, limit = 50, offset = 0 } = filters;

  let query = 'SELECT id, name, login, email, telegram_id, role, avatar_url, created_at FROM users WHERE 1=1';
  const params = [];

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const users = db.prepare(query).all(...params);
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();

  return {
    users,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

/**
 * Get or create user from Telegram data
 */
async function getOrCreateUserFromTelegram(telegramData) {
  const db = getDb();
  const { id: telegram_id, first_name, last_name, username, photo_url } = telegramData;

  // Try to find existing user
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id.toString());

  if (user) {
    // Update last seen info
    const name = username || `${first_name} ${last_name || ''}`.trim();
    db.prepare(`
      UPDATE users SET name = ?, avatar_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, photo_url || null, user.id);

    user.name = name;
    user.avatar_url = photo_url || user.avatar_url;
    return user;
  }

  // Create new user
  const name = username || `${first_name} ${last_name || ''}`.trim();
  return createUser({
    name,
    telegram_id: telegram_id.toString(),
    avatar_url: photo_url,
    role: 'user'
  });
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get user by auth token
 */
async function getUserByToken(token) {
  const db = getDb();

  const session = db.prepare(`
    SELECT s.*, u.*
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) return null;

  // Update last activity
  db.prepare(`
    UPDATE user_sessions SET last_activity_at = datetime('now') WHERE token = ?
  `).run(token);

  return {
    id: session.user_id,
    name: session.name,
    login: session.login,
    telegram_id: session.telegram_id,
    email: session.email,
    role: session.role,
    avatar_url: session.avatar_url,
    session_id: session.id
  };
}

/**
 * Create a new session
 */
async function createSession(userId, ipAddress = null, userAgent = null) {
  const db = getDb();

  const id = generateId();
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, expires_at, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    token,
    ipAddress,
    userAgent,
    expiresAt.toISOString(),
    now.toISOString(),
    now.toISOString()
  );

  return {
    token,
    expires_at: expiresAt.toISOString()
  };
}

/**
 * Generate a secure session token
 */
function generateSessionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'sess_';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Invalidate a session
 */
async function invalidateSession(token) {
  const db = getDb();
  db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
  return { success: true };
}

/**
 * Invalidate all user sessions
 */
async function invalidateAllUserSessions(userId) {
  const db = getDb();
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
  return { success: true };
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware to authenticate requests
 */
async function authMiddleware(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Unauthorized - No token provided');
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.substring(7);
  const user = await getUserByToken(token);

  if (!user) {
    const err = new Error('Unauthorized - Invalid or expired token');
    err.statusCode = 401;
    throw err;
  }

  // Attach user to request
  request.user = user;
}

/**
 * Optional auth middleware - doesn't fail if no token
 */
async function optionalAuthMiddleware(request, reply) {
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = await getUserByToken(token);
    if (user) {
      request.user = user;
    }
  }
}

/**
 * Admin-only middleware
 */
async function adminMiddleware(request, reply) {
  await authMiddleware(request, reply);

  if (request.user.role !== 'admin') {
    const err = new Error('Forbidden - Admin access required');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Role-based middleware factory
 */
function requireRole(...allowedRoles) {
  return async function roleMiddleware(request, reply) {
    await authMiddleware(request, reply);

    if (!allowedRoles.includes(request.user.role)) {
      const err = new Error(`Forbidden - Required role: ${allowedRoles.join(' or ')}`);
      err.statusCode = 403;
      throw err;
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // User management
  createUser,
  registerUser,
  getUserById,
  getUserByLogin,
  listUsers,
  getOrCreateUserFromTelegram,

  // Authentication
  authenticateUser,

  // Session management
  getUserByToken,
  createSession,
  invalidateSession,
  invalidateAllUserSessions,

  // Middleware
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  requireRole,

  // Utilities
  hashPassword,
  verifyPassword,
  SESSION_DURATION_HOURS
};