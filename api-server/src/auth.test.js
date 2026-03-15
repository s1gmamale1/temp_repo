const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { setupTestDb, cleanupTestDb } = require('../tests/helpers');

describe('auth', () => {
  let db;
  let dbPath;
  let auth;

  before(async () => {
    const result = await setupTestDb();
    db = result.db;
    dbPath = result.dbPath;
    // Require auth after DB is initialized
    delete require.cache[require.resolve('./auth')];
    auth = require('./auth');
  });

  after(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    cleanupTestDb(dbPath);
  });

  describe('hashPassword and verifyPassword', () => {
    it('hashPassword returns a string with $2b$ prefix', () => {
      const hash = auth.hashPassword('mypassword');
      assert.ok(hash);
      assert.strictEqual(typeof hash, 'string');
      assert.ok(hash.startsWith('$2b$'));
    });

    it('verifyPassword returns true for correct password', () => {
      const hash = auth.hashPassword('mypassword');
      const result = auth.verifyPassword('mypassword', hash);
      assert.strictEqual(result, true);
    });

    it('verifyPassword returns false for wrong password', () => {
      const hash = auth.hashPassword('mypassword');
      const result = auth.verifyPassword('wrongpassword', hash);
      assert.strictEqual(result, false);
    });

    it('verifyPassword returns false for null hash', () => {
      const result = auth.verifyPassword('password', null);
      assert.strictEqual(result, false);
    });

    it('verifyPassword returns false for invalid hash format', () => {
      const result = auth.verifyPassword('password', 'nothash');
      assert.strictEqual(result, false);
    });

    it('different passwords produce different hashes', () => {
      const hash1 = auth.hashPassword('password1');
      const hash2 = auth.hashPassword('password2');
      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('createUser', () => {
    it('creates a user and returns user object', async () => {
      const user = await auth.createUser({
        name: 'Test User',
        login: 'testuser_create',
        password: 'password123',
        role: 'user'
      });

      assert.ok(user);
      assert.ok(user.id);
      assert.strictEqual(user.name, 'Test User');
      assert.strictEqual(user.login, 'testuser_create');
      assert.strictEqual(user.role, 'user');
      assert.ok(user.created_at);
    });

    it('rejects duplicate login', async () => {
      await auth.createUser({
        name: 'First User',
        login: 'duplicate_login',
        password: 'password123'
      });

      await assert.rejects(
        () => auth.createUser({
          name: 'Second User',
          login: 'duplicate_login',
          password: 'password456'
        }),
        { message: 'Login already exists' }
      );
    });

    it('creates a user without a password', async () => {
      const user = await auth.createUser({
        name: 'No Password User',
        login: 'nopass_user'
      });

      assert.ok(user);
      assert.ok(user.id);
      assert.strictEqual(user.login, 'nopass_user');
    });
  });

  describe('authenticateUser', () => {
    before(async () => {
      // The admin user Scorpion was already seeded with bcryptjs hash
      // authenticateUser uses bcryptjs.compareSync, so we need a bcryptjs-hashed user
      const bcryptjs = require('bcryptjs');
      const { generateId } = require('./database');
      const id = generateId();
      const passwordHash = bcryptjs.hashSync('authtest123', 4);

      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, login, password_hash, role, created_at, updated_at)
        VALUES (?, 'Auth Test User', 'authtest', ?, 'user', datetime('now'), datetime('now'))
      `).run(id, passwordHash);
    });

    it('authenticates with correct credentials', async () => {
      const user = await auth.authenticateUser('authtest', 'authtest123');
      assert.ok(user);
      assert.strictEqual(user.login, 'authtest');
      assert.strictEqual(user.name, 'Auth Test User');
    });

    it('rejects wrong password', async () => {
      await assert.rejects(
        () => auth.authenticateUser('authtest', 'wrongpassword'),
        { message: 'Invalid credentials' }
      );
    });

    it('rejects nonexistent user', async () => {
      await assert.rejects(
        () => auth.authenticateUser('nonexistentuser', 'password'),
        { message: 'Invalid credentials' }
      );
    });

    it('rejects missing login or password', async () => {
      await assert.rejects(
        () => auth.authenticateUser(null, 'password'),
        { message: 'Login and password required' }
      );

      await assert.rejects(
        () => auth.authenticateUser('login', null),
        { message: 'Login and password required' }
      );
    });
  });

  describe('createSession and getUserByToken', () => {
    it('creates a session and returns token', async () => {
      const session = await auth.createSession('user-scorpion-001');
      assert.ok(session);
      assert.ok(session.token);
      assert.ok(session.token.startsWith('sess_'));
      assert.ok(session.expires_at);
    });

    it('getUserByToken returns user for valid token', async () => {
      const session = await auth.createSession('user-scorpion-001');
      const user = await auth.getUserByToken(session.token);

      assert.ok(user);
      assert.strictEqual(user.id, 'user-scorpion-001');
      assert.strictEqual(user.name, 'Scorpion');
      assert.strictEqual(user.role, 'admin');
    });

    it('getUserByToken returns null for invalid token', async () => {
      const user = await auth.getUserByToken('sess_invalidtoken12345678901234567890123456789012');
      assert.strictEqual(user, null);
    });

    it('getUserByToken returns null for expired session', async () => {
      // Create a session, then manually expire it
      const session = await auth.createSession('user-scorpion-001');

      // Manually set expires_at to the past
      db.prepare("UPDATE user_sessions SET expires_at = datetime('now', '-1 hour') WHERE token = ?")
        .run(session.token);

      const user = await auth.getUserByToken(session.token);
      assert.strictEqual(user, null);
    });

    it('session token has correct format', async () => {
      const session = await auth.createSession('user-scorpion-001');
      // Token: 'sess_' + 48 alphanumeric chars = 53 total
      assert.strictEqual(session.token.length, 53);
      assert.ok(session.token.startsWith('sess_'));
    });
  });
});
