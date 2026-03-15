const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

describe('config', () => {
  let config;

  before(() => {
    // Clear cache to get fresh config
    delete require.cache[require.resolve('./config')];
    // Set NODE_ENV to test to avoid production warnings
    process.env.NODE_ENV = 'test';
    config = require('./config');
  });

  it('PORT defaults to 3001', () => {
    // If PORT env var is not set, it defaults to 3001
    const expected = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    assert.strictEqual(config.PORT, expected);
  });

  it('HOST defaults to 0.0.0.0', () => {
    const expected = process.env.HOST || '0.0.0.0';
    assert.strictEqual(config.HOST, expected);
  });

  it('NODE_ENV is set', () => {
    assert.ok(config.NODE_ENV);
    assert.strictEqual(typeof config.NODE_ENV, 'string');
  });

  it('DB_TYPE defaults to sqlite', () => {
    if (!process.env.DATABASE_URL) {
      assert.strictEqual(config.DB_TYPE, 'sqlite');
    }
  });

  it('DB_PATH is defined for sqlite', () => {
    if (config.DB_TYPE === 'sqlite') {
      assert.ok(config.DB_PATH);
      assert.strictEqual(typeof config.DB_PATH, 'string');
    }
  });

  it('RATE_LIMIT_MAX is a number', () => {
    assert.strictEqual(typeof config.RATE_LIMIT_MAX, 'number');
    assert.ok(config.RATE_LIMIT_MAX > 0);
  });

  it('CORS_ORIGINS is an array', () => {
    assert.ok(Array.isArray(config.CORS_ORIGINS));
    assert.ok(config.CORS_ORIGINS.length > 0);
  });

  it('features object has expected flags', () => {
    assert.ok(config.features);
    assert.strictEqual(typeof config.features.enableWebSockets, 'boolean');
    assert.strictEqual(typeof config.features.enableRateLimiting, 'boolean');
    assert.strictEqual(typeof config.features.enableRequestLogging, 'boolean');
  });

  it('bcryptRounds defaults to 12', () => {
    const expected = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS) : 12;
    assert.strictEqual(config.bcryptRounds, expected);
  });
});
