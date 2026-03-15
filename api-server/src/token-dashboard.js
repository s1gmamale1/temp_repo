/**
 * Token Dashboard Module
 * storeTokenUsage: writes to cost_records with normalised provider field
 */

const { getDb, generateId } = require('./database');

function normalizeProvider(model, explicitProvider) {
  if (explicitProvider) {
    const p = explicitProvider.toLowerCase();
    if (p.includes('kimi') || p.includes('moonshot')) return 'kimi';
    if (p.includes('openai') || p.includes('gpt') || p.includes('o1') || p.includes('o3')) return 'openai';
    if (p.includes('claude') || p.includes('anthropic')) return 'claude';
    return explicitProvider.toLowerCase();
  }
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('kimi') || m.includes('moonshot')) return 'kimi';
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('openai')) return 'openai';
  if (m.includes('claude') || m.includes('anthropic')) return 'claude';
  return model.split('/')[0] || 'unknown';
}

async function storeTokenUsage(data) {
  const db = getDb();
  const { project_id, user_id, provider, model, prompt_tokens, completion_tokens, cost_usd } = data;

  if (!model) return { success: false, error: 'model is required' };

  const id            = generateId();
  const total_tokens  = (prompt_tokens || 0) + (completion_tokens || 0);
  const normProvider  = normalizeProvider(model, provider);
  const now           = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO cost_records (id, project_id, user_id, provider, model,
        prompt_tokens, completion_tokens, total_tokens, cost_usd, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id || null, user_id || null, normProvider, model,
        prompt_tokens || 0, completion_tokens || 0, total_tokens, cost_usd || 0, now);

    return { success: true, id, provider: normProvider, total_tokens };
  } catch (error) {
    console.error('Failed to store token usage:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { storeTokenUsage };
