// auth.routes.js - Authentication API routes
const { createTokenPair, refreshAccessToken, revokeAllUserTokens, cleanupExpiredTokens } = require('./auth.service');
const { getDb } = require('./database');
const bcrypt = require('bcryptjs');

/**
 * POST /api/auth/login
 * Authenticate user and return token pair
 */
async function login(req, reply) {
  try {
    const { login, password } = req.body;

    // Validate input
    if (!login || !password) {
      reply.code(400);
      return { error: 'MISSING_CREDENTIALS', message: 'Login and password required' };
    }

    const db = getDb();

    // Find user by login or email
    const user = db.prepare(`
      SELECT * FROM users 
      WHERE login = ? OR email = ?
    `).get(login, login);

    if (!user) {
      reply.code(401);
      return { error: 'INVALID_CREDENTIALS', message: 'Invalid login or password' };
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      reply.code(401);
      return { error: 'INVALID_CREDENTIALS', message: 'Invalid login or password' };
    }

    // Check if user is active
    if (user.is_active === false || user.is_active === 0) {
      reply.code(403);
      return { error: 'ACCOUNT_DISABLED', message: 'Account has been disabled' };
    }

    // Create token pair
    const { accessToken, refreshToken } = await createTokenPair(user.id);

    // Update last login
    db.prepare(`
      UPDATE users 
      SET last_login_at = datetime('now')
      WHERE id = ?
    `).run(user.id);

    // Return tokens and user info
    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900, // 15 minutes in seconds
      token_type: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url
      }
    };

  } catch (error) {
    console.error('Login error:', error);
    reply.code(500);
    return { error: 'LOGIN_ERROR', message: 'Authentication failed' };
  }
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
async function refresh(req, reply) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      reply.code(400);
      return { error: 'MISSING_REFRESH_TOKEN', message: 'Refresh token required' };
    }

    // Refresh tokens
    const tokens = await refreshAccessToken(refresh_token);

    if (!tokens) {
      reply.code(401);
      return { error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token expired or revoked. Please login again.' };
    }

    return {
      success: true,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: 900,
      token_type: 'Bearer'
    };

  } catch (error) {
    console.error('Refresh error:', error);
    reply.code(500);
    return { error: 'REFRESH_ERROR', message: 'Token refresh failed' };
  }
}

/**
 * POST /api/auth/logout
 * Revoke all tokens for current user
 */
async function logout(req, reply) {
  try {
    // req.user is set by authenticateToken middleware
    if (!req.user) {
      reply.code(401);
      return { error: 'NOT_AUTHENTICATED', message: 'Not logged in' };
    }

    await revokeAllUserTokens(req.user.id);

    return {
      success: true,
      message: 'Logged out successfully. All tokens revoked.'
    };

  } catch (error) {
    console.error('Logout error:', error);
    reply.code(500);
    return { error: 'LOGOUT_ERROR', message: 'Logout failed' };
  }
}

/**
 * GET /api/auth/me
 * Get current user info from token
 */
async function getCurrentUser(req, reply) {
  try {
    if (!req.user) {
      reply.code(401);
      return { error: 'NOT_AUTHENTICATED', message: 'Not logged in' };
    }

    const db = getDb();

    // Get fresh user data
    const user = db.prepare(`
      SELECT id, name, login, email, role, avatar_url, created_at, last_login_at
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      reply.code(404);
      return { error: 'USER_NOT_FOUND', message: 'User not found' };
    }

    return {
      user: {
        ...user,
        is_authenticated: true
      }
    };

  } catch (error) {
    console.error('Get current user error:', error);
    reply.code(500);
    return { error: 'USER_ERROR', message: 'Failed to get user info' };
  }
}

/**
 * POST /api/auth/register
 * Register new user (admin only or public based on config)
 */
async function register(req, reply) {
  try {
    const { name, login, email, password, role = 'user' } = req.body;

    // Validate required fields
    if (!name || !login || !email || !password) {
      reply.code(400);
      return {
        error: 'MISSING_FIELDS',
        message: 'Name, login, email, and password required'
      };
    }

    // Validate password strength
    if (password.length < 8) {
      reply.code(400);
      return { error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' };
    }

    const db = getDb();

    // Check for existing user
    const existing = db.prepare(`
      SELECT * FROM users 
      WHERE login = ? OR email = ?
    `).get(login, email);

    if (existing) {
      reply.code(409);
      return { error: 'USER_EXISTS', message: 'Login or email already taken' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { v4: uuidv4 } = require('uuid');
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, login, email, password_hash, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, TRUE, datetime('now'))
    `).run(userId, name, login, email, passwordHash, role);

    // Create token pair for immediate login
    const { accessToken, refreshToken } = await createTokenPair(userId);

    return {
      success: true,
      message: 'User registered successfully',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      user: {
        id: userId,
        name,
        login,
        email,
        role
      }
    };

  } catch (error) {
    console.error('Registration error:', error);
    reply.code(500);
    return { error: 'REGISTRATION_ERROR', message: 'Registration failed' };
  }
}

/**
 * POST /api/auth/change-password
 * Change user password
 */
async function changePassword(req, reply) {
  try {
    if (!req.user) {
      reply.code(401);
      return { error: 'NOT_AUTHENTICATED', message: 'Not logged in' };
    }

    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      reply.code(400);
      return { error: 'MISSING_PASSWORDS', message: 'Current and new password required' };
    }

    if (new_password.length < 8) {
      reply.code(400);
      return { error: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters' };
    }

    const db = getDb();

    // Get current password hash
    const user = db.prepare(`
      SELECT password_hash FROM users WHERE id = ?
    `).get(req.user.id);

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, user.password_hash);

    if (!validPassword) {
      reply.code(401);
      return { error: 'INVALID_PASSWORD', message: 'Current password is incorrect' };
    }

    // Hash new password
    const newHash = await bcrypt.hash(new_password, 12);

    // Update password
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newHash, req.user.id);

    // Revoke all tokens (force re-login)
    await revokeAllUserTokens(req.user.id);

    return {
      success: true,
      message: 'Password changed successfully. Please login again.'
    };

  } catch (error) {
    console.error('Change password error:', error);
    reply.code(500);
    return { error: 'PASSWORD_CHANGE_ERROR', message: 'Failed to change password' };
  }
}

module.exports = {
  login,
  refresh,
  logout,
  getCurrentUser,
  register,
  changePassword,
  cleanupExpiredTokens
};