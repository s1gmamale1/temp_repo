const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { setupTestDb, cleanupTestDb } = require('../tests/helpers');

describe('auth.service', () => {
  let db;
  let dbPath;
  let authService;

  before(async () => {
    const result = await setupTestDb();
    db = result.db;
    dbPath = result.dbPath;
    // Require auth.service after DB is initialized
    delete require.cache[require.resolve('./auth.service')];
    authService = require('./auth.service');
  });

  after(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    cleanupTestDb(dbPath);
  });

  describe('generateToken', () => {
    it('returns a 64-character hex string', () => {
      const token = authService.generateToken();
      assert.ok(token);
      assert.strictEqual(typeof token, 'string');
      assert.strictEqual(token.length, 64);
      assert.match(token, /^[0-9a-f]{64}$/);
    });

    it('generates unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 50; i++) {
        tokens.add(authService.generateToken());
      }
      assert.strictEqual(tokens.size, 50);
    });
  });

  describe('hashToken', () => {
    it('returns a consistent hash for the same input', () => {
      const token = 'test-token-12345';
      const hash1 = authService.hashToken(token);
      const hash2 = authService.hashToken(token);
      assert.strictEqual(hash1, hash2);
    });

    it('returns a hex string', () => {
      const hash = authService.hashToken('some-token');
      assert.ok(hash);
      assert.strictEqual(typeof hash, 'string');
      assert.match(hash, /^[0-9a-f]+$/);
    });

    it('returns different hashes for different tokens', () => {
      const hash1 = authService.hashToken('token-a');
      const hash2 = authService.hashToken('token-b');
      assert.notStrictEqual(hash1, hash2);
    });

    it('returns a 64-char SHA-256 hash', () => {
      const hash = authService.hashToken('any-token');
      assert.strictEqual(hash.length, 64);
    });
  });

  describe('createTokenPair', () => {
    it('returns accessToken and refreshToken', async () => {
      const result = await authService.createTokenPair('user-scorpion-001');
      assert.ok(result);
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);
    });

    it('tokens are 64-char hex strings', async () => {
      const result = await authService.createTokenPair('user-scorpion-001');
      assert.strictEqual(result.accessToken.length, 64);
      assert.strictEqual(result.refreshToken.length, 64);
      assert.match(result.accessToken, /^[0-9a-f]{64}$/);
      assert.match(result.refreshToken, /^[0-9a-f]{64}$/);
    });

    it('stores tokens in auth_tokens table', async () => {
      const result = await authService.createTokenPair('user-scorpion-001');
      const accessHash = authService.hashToken(result.accessToken);
      const refreshHash = authService.hashToken(result.refreshToken);

      const accessRecord = db.prepare(
        "SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'access'"
      ).get(accessHash);
      assert.ok(accessRecord, 'Access token should be stored in DB');

      const refreshRecord = db.prepare(
        "SELECT * FROM auth_tokens WHERE token_hash = ? AND token_type = 'refresh'"
      ).get(refreshHash);
      assert.ok(refreshRecord, 'Refresh token should be stored in DB');
    });
  });

  describe('verifyAccessToken', () => {
    it('returns user data for a valid access token', async () => {
      const { accessToken } = await authService.createTokenPair('user-scorpion-001');
      const userData = await authService.verifyAccessToken(accessToken);

      assert.ok(userData);
      assert.strictEqual(userData.userId, 'user-scorpion-001');
      assert.strictEqual(userData.role, 'admin');
      assert.strictEqual(userData.name, 'Scorpion');
      assert.ok(userData.tokenId);
    });

    it('returns null for an invalid token', async () => {
      const result = await authService.verifyAccessToken('invalid-token-not-in-db');
      assert.strictEqual(result, null);
    });

    it('returns null for a revoked token', async () => {
      const { accessToken } = await authService.createTokenPair('user-scorpion-001');
      const accessHash = authService.hashToken(accessToken);

      // Revoke the token
      db.prepare("UPDATE auth_tokens SET is_revoked = 1 WHERE token_hash = ?").run(accessHash);

      const result = await authService.verifyAccessToken(accessToken);
      assert.strictEqual(result, null);
    });

    it('returns null for an expired token', async () => {
      const { accessToken } = await authService.createTokenPair('user-scorpion-001');
      const accessHash = authService.hashToken(accessToken);

      // Set expiry to the past
      db.prepare("UPDATE auth_tokens SET expires_at = datetime('now', '-1 hour') WHERE token_hash = ?")
        .run(accessHash);

      const result = await authService.verifyAccessToken(accessToken);
      assert.strictEqual(result, null);
    });
  });
});
