#!/usr/bin/env node
/**
 * health-check.js — PROJECT-CLAW diagnostic script
 *
 * Checks reachability of API server, frontend (web-hq), and Ollama.
 * Safe to run at any time — read-only, no side effects.
 *
 * Usage:
 *   node api-server/scripts/health-check.js
 *   node api-server/scripts/health-check.js --api http://192.168.1.94:3001 --web http://192.168.1.94
 */

const http  = require('http');
const https = require('https');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const API_URL    = getArg('--api',    process.env.API_URL    || 'http://localhost:3001');
const WEB_URL    = getArg('--web',    process.env.WEB_URL    || 'http://localhost:5173');
const OLLAMA_URL = getArg('--ollama', process.env.OLLAMA_BASE_URL || 'http://localhost:11434');

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  G:  '\x1b[32m', R: '\x1b[31m', Y: '\x1b[33m',
  C:  '\x1b[36m', B: '\x1b[1m',  X: '\x1b[0m',
};
const ok   = msg => console.log(`  ${C.G}✓${C.X}  ${msg}`);
const fail = msg => console.log(`  ${C.R}✗${C.X}  ${msg}`);
const warn = msg => console.log(`  ${C.Y}⚠${C.X}  ${msg}`);
const info = msg => console.log(`  ${C.C}·${C.X}  ${msg}`);

// ── HTTP probe (timeout 4s) ───────────────────────────────────────────────────
function probe(url, opts = {}) {
  return new Promise(resolve => {
    try {
      const u   = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     opts.path || u.pathname || '/',
        method:   opts.method || 'GET',
        timeout:  4000,
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch {}
          resolve({ ok: res.statusCode < 500, status: res.statusCode, body: parsed || body.substring(0, 200) });
        });
        res.resume();
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout', body: null }); });
      req.on('error',   e  => resolve({ ok: false, status: 'error', body: e.message }));
      req.end();
    } catch (e) {
      resolve({ ok: false, status: 'error', body: e.message });
    }
  });
}

// ── Check API server ──────────────────────────────────────────────────────────
async function checkApi() {
  console.log(`\n${C.B}API Server${C.X} (${API_URL})`);

  const health = await probe(API_URL, { path: '/health' });
  if (health.ok) {
    ok(`/health  →  HTTP ${health.status}`);
    if (health.body && typeof health.body === 'object') {
      info(`status: ${health.body.status}  db: ${health.body.database}  uptime: ${health.body.uptime}s`);
      info(`env: ${health.body.environment}  mem: ${health.body.memory?.used}MB / ${health.body.memory?.total}MB`);
    }
  } else {
    fail(`/health  →  ${health.status}  (${health.body || 'no response'})`);
    warn(`Is the API server running?  cd api-server && npm run dev`);
  }

  const ready = await probe(API_URL, { path: '/ready' });
  if (ready.ok) ok(`/ready   →  HTTP ${ready.status}`);
  else          fail(`/ready   →  ${ready.status}`);

  return health.ok;
}

// ── Check frontend ────────────────────────────────────────────────────────────
async function checkWeb() {
  console.log(`\n${C.B}Frontend${C.X} (${WEB_URL})`);

  const r = await probe(WEB_URL, { path: '/' });
  if (r.ok) {
    ok(`/  →  HTTP ${r.status}`);
  } else {
    fail(`/  →  ${r.status}  (${typeof r.body === 'string' ? r.body.substring(0, 80) : r.body})`);
    warn(`Is the frontend running?  cd web-hq && npm run dev`);
  }
  return r.ok;
}

// ── Check Ollama ──────────────────────────────────────────────────────────────
async function checkOllama() {
  console.log(`\n${C.B}Ollama${C.X} (${OLLAMA_URL})`);

  const tags = await probe(OLLAMA_URL, { path: '/api/tags' });
  if (tags.ok) {
    ok(`/api/tags  →  HTTP ${tags.status}`);
    const models = tags.body?.models || [];
    if (models.length === 0) {
      warn(`No models found. Pull one:  ollama pull qwen2.5-coder:7b`);
    } else {
      info(`${models.length} model(s): ${models.map(m => m.name).join(', ')}`);
    }
  } else {
    fail(`/api/tags  →  ${tags.status}  (${tags.body || 'no response'})`);
    warn(`Is Ollama running?  ollama serve`);
    warn(`AI tasks will fall back to simulation mode.`);
  }
  return tags.ok;
}

// ── Check AI provider env ──────────────────────────────────────────────────────
function checkEnv() {
  console.log(`\n${C.B}Environment${C.X}`);

  const provider = process.env.AI_PROVIDER || '(not set — defaults to auto)';
  info(`AI_PROVIDER=${provider}`);

  if ((process.env.AI_PROVIDER || 'auto') === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('your-key')) {
      fail(`AI_PROVIDER=openrouter but OPENROUTER_API_KEY is missing or placeholder`);
      warn(`Tasks will fall back to simulation. Set a real key in api-server/.env`);
    } else {
      ok(`OPENROUTER_API_KEY is set`);
    }
  }

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('your-key')) {
    info(`OPENROUTER_API_KEY not set — OpenRouter fallback disabled`);
  } else {
    ok(`OPENROUTER_API_KEY is set`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.B}╔═══════════════════════════════════════╗`);
  console.log(`║   PROJECT-CLAW  Health Check          ║`);
  console.log(`╚═══════════════════════════════════════╝${C.X}`);

  // Load .env if running from api-server directory
  try {
    const path = require('path');
    const fs   = require('fs');
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      }
    }
  } catch {}

  const apiOk    = await checkApi();
  const webOk    = await checkWeb();
  const ollamaOk = await checkOllama();
  checkEnv();

  // Summary
  console.log(`\n${C.B}Summary${C.X}`);
  const all = [
    { name: 'API server', ok: apiOk },
    { name: 'Frontend',   ok: webOk },
    { name: 'Ollama',     ok: ollamaOk },
  ];
  for (const s of all) {
    if (s.ok) ok(s.name);
    else      fail(s.name);
  }

  const allOk = all.every(s => s.ok);
  console.log('');
  if (!allOk) {
    console.log(`${C.Y}Some services are not reachable — see above for recovery steps.${C.X}`);
    process.exit(1);
  } else {
    console.log(`${C.G}All services reachable.${C.X}`);
  }
}

main().catch(e => { console.error('Check failed:', e.message); process.exit(1); });
