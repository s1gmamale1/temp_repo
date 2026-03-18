/**
 * env-check.js — Startup environment safety checks
 *
 * Emits warnings for misconfigured or missing env vars.
 * Non-fatal: all checks log warnings only, no exceptions thrown.
 * Called once from server.js during buildServer().
 */

function runEnvChecks(logger) {
  const log = logger || console;
  const warn = msg => {
    if (typeof log.warn === 'function') log.warn(msg);
    else console.warn(`[env-check] WARN: ${msg}`);
  };
  const info = msg => {
    if (typeof log.info === 'function') log.info(msg);
    else console.log(`[env-check] ${msg}`);
  };

  const provider    = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  const apiKey      = process.env.OPENROUTER_API_KEY || '';
  const ollamaUrl   = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const jwtSecret   = process.env.JWT_SECRET || '';
  const nodeEnv     = process.env.NODE_ENV || 'development';
  const isProd      = nodeEnv === 'production';

  // ── AI provider checks ───────────────────────────────────────────────────
  if (provider === 'openrouter') {
    if (!apiKey || apiKey.startsWith('sk-or-v1-your')) {
      warn('[env-check] AI_PROVIDER=openrouter but OPENROUTER_API_KEY is missing or is a placeholder. ' +
           'All task executions will fall back to simulation mode. ' +
           'Set a real key in api-server/.env or unset AI_PROVIDER to use auto mode.');
    }
  }

  if (provider === 'ollama') {
    info(`[env-check] AI_PROVIDER=ollama — using local Ollama at ${ollamaUrl}. ` +
         `Ensure 'ollama serve' is running before executing tasks.`);
  }

  if (provider === 'auto') {
    if (!apiKey || apiKey.startsWith('sk-or-v1-your')) {
      info('[env-check] AI_PROVIDER=auto — will try Ollama first. ' +
           'OpenRouter fallback is disabled (no OPENROUTER_API_KEY set). ' +
           'If Ollama is also unreachable, tasks will be simulated.');
    }
  }

  // ── JWT secret check (production only) ──────────────────────────────────
  if (isProd && !jwtSecret) {
    warn('[env-check] JWT_SECRET is not set in production. ' +
         'A random secret will be generated on startup, which means all sessions ' +
         'will be invalidated on server restart. Set JWT_SECRET in .env for persistent sessions.');
  }

  // ── Database path ────────────────────────────────────────────────────────
  const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  if (dbType === 'postgresql') {
    if (!process.env.DATABASE_URL) {
      warn('[env-check] DB_TYPE=postgresql but DATABASE_URL is not set. ' +
           'Server will fail to connect to the database.');
    }
  }

  info(`[env-check] Provider: ${provider}  DB: ${dbType}  Env: ${nodeEnv}`);
}

module.exports = { runEnvChecks };
