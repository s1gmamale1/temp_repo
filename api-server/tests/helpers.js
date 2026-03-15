/**
 * Test helpers - shared utilities for unit and integration tests
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Create a unique temporary database path for test isolation
 */
function getTempDbPath() {
  const tmpDir = os.tmpdir();
  const uniqueName = `test-claw-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  return path.join(tmpDir, uniqueName);
}

/**
 * Set up a test database by configuring DB_PATH env var,
 * then initializing the database. Returns the db adapter instance.
 */
async function setupTestDb() {
  const dbPath = getTempDbPath();
  process.env.DB_PATH = dbPath;
  process.env.DB_TYPE = 'sqlite';
  process.env.NODE_ENV = 'test';

  // Clear the cached module so initDatabase picks up the new DB_PATH
  clearDatabaseModule();

  const { initDatabase } = require('../src/database');
  const db = await initDatabase();
  return { db, dbPath };
}

/**
 * Clean up the test database files
 */
function cleanupTestDb(dbPath) {
  clearDatabaseModule();

  if (!dbPath) return;
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Clear the database module from require cache so next require gets a fresh instance.
 * Also clears config cache since config caches DB_PATH at require time.
 */
function clearDatabaseModule() {
  const dbModulePath = require.resolve('../src/database');
  const configModulePath = require.resolve('../src/config');
  delete require.cache[dbModulePath];
  delete require.cache[configModulePath];
}

/**
 * Create a test user and return a valid session token.
 * Requires the database to be initialized first.
 */
async function getTestToken(options = {}) {
  const { getDb, generateId } = require('../src/database');
  const db = getDb();
  const bcryptjs = require('bcryptjs');

  const userId = options.userId || generateId();
  const login = options.login || `testuser_${Date.now()}`;
  const password = options.password || 'testpass123';
  const role = options.role || 'admin';
  const name = options.name || 'Test User';

  const passwordHash = bcryptjs.hashSync(password, 4); // Low rounds for speed

  // Insert user
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, login, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(userId, name, login, passwordHash, role);

  // Create session
  const { createSession } = require('../src/auth');
  const session = await createSession(userId);

  return {
    token: session.token,
    userId,
    login,
    password,
    role,
    name
  };
}

module.exports = {
  getTempDbPath,
  setupTestDb,
  cleanupTestDb,
  clearDatabaseModule,
  getTestToken
};
