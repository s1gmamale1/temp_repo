const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Helper: make an HTTP request and return { statusCode, headers, body }
 */
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

describe('API integration tests', () => {
  let fastifyApp;
  let port;
  let dbPath;

  before(async () => {
    // Set up temp database
    const tmpDir = os.tmpdir();
    dbPath = path.join(tmpDir, `test-integration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.DB_PATH = dbPath;
    process.env.DB_TYPE = 'sqlite';
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error'; // Suppress noisy logs during tests

    // Clear all relevant module caches to avoid singleton conflicts
    const srcDir = path.resolve(__dirname, '../../src');
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(srcDir)) {
        delete require.cache[key];
      }
    }

    // Now build a fresh Fastify app. We cannot use server.js directly because
    // it calls start() at module level. Instead, we re-create the essential setup.
    const fastify = require('fastify');
    const cors = require('@fastify/cors');
    const websocket = require('@fastify/websocket');
    const rateLimit = require('@fastify/rate-limit');

    // Initialize the database first
    const { initDatabase, getDb } = require('../../src/database');
    await initDatabase();

    // Now require modules that depend on an initialized DB
    const routes = require('../../src/routes');
    const { optionalAuthMiddleware, authMiddleware } = require('../../src/auth');

    fastifyApp = fastify({
      logger: false,
      pluginTimeout: 10000
    });

    await fastifyApp.register(rateLimit, { max: 10000, timeWindow: '1 minute' });
    await fastifyApp.register(cors, { origin: true });
    await fastifyApp.register(websocket);

    // Health check
    fastifyApp.get('/health', async () => {
      const db = getDb();
      let dbStatus = 'unknown';
      try {
        db.prepare('SELECT 1').get();
        dbStatus = 'connected';
      } catch (err) {
        dbStatus = 'error';
      }
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbStatus
      };
    });

    // Auth routes
    fastifyApp.post('/api/auth/login', {
      schema: {
        body: {
          type: 'object',
          required: ['login', 'password'],
          properties: {
            login: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 }
          }
        }
      }
    }, routes.loginRoute);

    // Projects
    fastifyApp.get('/api/projects', { preHandler: authMiddleware }, routes.listProjects);

    // Agents
    fastifyApp.get('/api/agents', { preHandler: authMiddleware }, routes.listManagerAgentsRoute);
    fastifyApp.post('/api/agents/register', routes.registerManagerAgentRoute);

    const address = await fastifyApp.listen({ port: 0, host: '127.0.0.1' });
    const url = new URL(address);
    port = parseInt(url.port, 10);
  });

  after(async () => {
    if (fastifyApp) {
      await fastifyApp.close();
    }
    // Clean up temp db
    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) { /* ignore */ }
  });

  function apiRequest(method, urlPath, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return httpRequest({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers
    }, body ? JSON.stringify(body) : null);
  }

  describe('GET /health', () => {
    it('returns status ok', async () => {
      const res = await apiRequest('GET', '/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.timestamp);
      assert.strictEqual(res.body.database, 'connected');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns session token with valid credentials (Scorpion)', async () => {
      const res = await apiRequest('POST', '/api/auth/login', {
        body: { login: 'Scorpion', password: 'Scorpion123' }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.name, 'Scorpion');
      assert.strictEqual(res.body.user.role, 'admin');
      assert.ok(res.body.session);
      assert.ok(res.body.session.token);
      assert.ok(res.body.session.token.startsWith('sess_'));
    });

    it('returns error for invalid credentials', async () => {
      const res = await apiRequest('POST', '/api/auth/login', {
        body: { login: 'Scorpion', password: 'wrongpassword' }
      });
      assert.ok(res.statusCode >= 400, `Expected error status, got ${res.statusCode}`);
    });

    it('returns 400 for missing fields', async () => {
      const res = await apiRequest('POST', '/api/auth/login', {
        body: { login: 'Scorpion' }
      });
      assert.ok(res.statusCode >= 400, `Expected 4xx, got ${res.statusCode}`);
    });
  });

  describe('GET /api/projects', () => {
    it('returns 401 without auth token', async () => {
      const res = await apiRequest('GET', '/api/projects');
      assert.strictEqual(res.statusCode, 401);
    });

    it('returns projects list with valid token', async () => {
      // First login to get a token
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        body: { login: 'Scorpion', password: 'Scorpion123' }
      });
      const token = loginRes.body.session.token;

      const res = await apiRequest('GET', '/api/projects', { token });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body);
      // The response may be an object with a projects property or an array
      const projects = Array.isArray(res.body) ? res.body : (res.body.projects || []);
      assert.ok(Array.isArray(projects));
    });
  });

  describe('GET /api/agents', () => {
    it('returns 401 without auth token', async () => {
      const res = await apiRequest('GET', '/api/agents');
      assert.strictEqual(res.statusCode, 401);
    });

    it('returns agents list with valid admin token', async () => {
      const loginRes = await apiRequest('POST', '/api/auth/login', {
        body: { login: 'Scorpion', password: 'Scorpion123' }
      });
      const token = loginRes.body.session.token;

      const res = await apiRequest('GET', '/api/agents', { token });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body);
    });
  });

  describe('POST /api/agents/register', () => {
    it('registers a new agent', async () => {
      const agentName = `TestAgent_${Date.now()}`;
      const handle = `testagent${Date.now()}`;

      const res = await apiRequest('POST', '/api/agents/register', {
        body: {
          name: agentName,
          handle: handle,
          role: 'developer'
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.body.id);
      assert.strictEqual(res.body.name, agentName);
      assert.strictEqual(res.body.handle, `@${handle}`);
      assert.strictEqual(res.body.is_approved, false);
      assert.ok(res.body.token, 'Should return a session token');
    });

    it('rejects duplicate handle', async () => {
      const handle = `dupehandle${Date.now()}`;

      await apiRequest('POST', '/api/agents/register', {
        body: { name: 'Agent1', handle }
      });

      const res = await apiRequest('POST', '/api/agents/register', {
        body: { name: 'Agent2', handle }
      });

      assert.strictEqual(res.statusCode, 409);
    });

    it('rejects missing name', async () => {
      const res = await apiRequest('POST', '/api/agents/register', {
        body: { handle: 'noname123' }
      });
      assert.strictEqual(res.statusCode, 400);
    });

    it('rejects missing handle', async () => {
      const res = await apiRequest('POST', '/api/agents/register', {
        body: { name: 'No Handle Agent' }
      });
      assert.strictEqual(res.statusCode, 400);
    });
  });
});
