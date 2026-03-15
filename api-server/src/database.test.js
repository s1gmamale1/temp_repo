const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { setupTestDb, cleanupTestDb } = require('../tests/helpers');

describe('database', () => {
  let db;
  let dbPath;

  before(async () => {
    const result = await setupTestDb();
    db = result.db;
    dbPath = result.dbPath;
  });

  after(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    cleanupTestDb(dbPath);
  });

  it('initDatabase returns a database adapter', () => {
    assert.ok(db);
    assert.strictEqual(typeof db.prepare, 'function');
  });

  it('getDb returns the database instance', () => {
    const { getDb } = require('./database');
    const instance = getDb();
    assert.ok(instance);
    assert.strictEqual(typeof instance.prepare, 'function');
  });

  it('generateId returns a valid UUID string', () => {
    const { generateId } = require('./database');
    const id = generateId();
    assert.ok(id);
    assert.strictEqual(typeof id, 'string');
    // UUID v4 format: 8-4-4-4-12 hex characters
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique IDs', () => {
    const { generateId } = require('./database');
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    assert.strictEqual(ids.size, 100);
  });

  it('creates the users table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    assert.ok(table);
    assert.strictEqual(table.name, 'users');
  });

  it('creates the projects table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
    assert.ok(table);
  });

  it('creates the tasks table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    assert.ok(table);
  });

  it('creates the messages table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").get();
    assert.ok(table);
  });

  it('creates the user_sessions table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'").get();
    assert.ok(table);
  });

  it('creates the channels table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channels'").get();
    assert.ok(table);
  });

  it('creates the manager_agents table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='manager_agents'").get();
    assert.ok(table);
  });

  it('creates the auth_tokens table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_tokens'").get();
    assert.ok(table);
  });

  it('creates the notifications table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'").get();
    assert.ok(table);
  });

  it('creates the agent_notifications table', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_notifications'").get();
    assert.ok(table);
  });

  it('seeds the default admin user Scorpion', () => {
    const admin = db.prepare("SELECT * FROM users WHERE id = 'user-scorpion-001'").get();
    assert.ok(admin, 'Admin user Scorpion should exist');
    assert.strictEqual(admin.name, 'Scorpion');
    assert.strictEqual(admin.login, 'Scorpion');
    assert.strictEqual(admin.role, 'admin');
  });

  it('seeds the general channel', () => {
    const channel = db.prepare("SELECT * FROM channels WHERE id = 'general'").get();
    assert.ok(channel, 'General channel should exist');
    assert.strictEqual(channel.name, 'general');
    assert.strictEqual(channel.type, 'general');
  });
});
