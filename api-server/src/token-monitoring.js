/**
 * Token Monitoring Module
 * Live DB queries — no hardcoded usage values
 * Budgets are config; everything else is real data
 */

const { getDb } = require('./database');

// Budget config (only hardcoded values — intentional)
const PROVIDER_BUDGETS = {
  openai: { budget: Number(process.env.BUDGET_OPENAI || 120) },
  claude: { budget: Number(process.env.BUDGET_CLAUDE || 100) },
  ollama: { budget: Number(process.env.BUDGET_OLLAMA || 0) }
};

function normalizeProvider(provider) {
  if (!provider) return 'unknown';
  const p = provider.toLowerCase().trim();
  if (p.includes('openai') || p.includes('gpt') || p.includes('o1') || p.includes('o3')) return 'openai';
  if (p.includes('claude') || p.includes('anthropic') || p.includes('openrouter')) return 'claude';
  if (p.includes('ollama') || p.includes('local')) return 'ollama';
  return p;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthBounds(month) {
  let start, end;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, mon] = month.split('-').map(Number);
    start = new Date(year, mon - 1, 1).toISOString();
    end   = new Date(year, mon, 1).toISOString();
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  }
  return { start, end };
}

function getDaysBounds(days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const end   = new Date(now.getTime() + 1000).toISOString(); // +1s to include current moment
  return { start, end };
}

function resolveBounds(month, days) {
  if (days && Number(days) > 0) return getDaysBounds(Number(days));
  return getMonthBounds(month);
}

async function getDashboardSummary(month, days) {
  const db = getDb();
  const { start, end } = resolveBounds(month, days);

  const rows = db.prepare(`
    SELECT provider,
      SUM(cost_usd) AS used, SUM(total_tokens) AS tokens,
      SUM(prompt_tokens) AS input_tokens, SUM(completion_tokens) AS output_tokens,
      COUNT(*) AS request_count
    FROM cost_records WHERE recorded_at >= ? AND recorded_at < ?
    GROUP BY provider
  `).all(start, end);

  const map = {};
  for (const row of rows) {
    const key = normalizeProvider(row.provider);
    if (!map[key]) map[key] = { used: 0, tokens: 0, input_tokens: 0, output_tokens: 0, request_count: 0 };
    map[key].used          += row.used || 0;
    map[key].tokens        += row.tokens || 0;
    map[key].input_tokens  += row.input_tokens || 0;
    map[key].output_tokens += row.output_tokens || 0;
    map[key].request_count += row.request_count || 0;
  }

  const providers = Object.keys(PROVIDER_BUDGETS).map(key => {
    const data   = map[key] || {};
    const budget = PROVIDER_BUDGETS[key].budget;
    const used   = parseFloat((data.used || 0).toFixed(4));
    return {
      name: key, budget, used,
      remaining:     parseFloat((budget - used).toFixed(4)),
      tokens:        Math.round(data.tokens || 0),
      input_tokens:  Math.round(data.input_tokens || 0),
      output_tokens: Math.round(data.output_tokens || 0),
      request_count: data.request_count || 0
    };
  });

  const totalBudget    = providers.reduce((s, p) => s + p.budget, 0);
  const totalUsed      = parseFloat(providers.reduce((s, p) => s + p.used, 0).toFixed(4));
  const totalTokens    = providers.reduce((s, p) => s + p.tokens, 0);

  return {
    month: month || getCurrentMonth(),
    totalBudget, totalUsed,
    totalRemaining: parseFloat((totalBudget - totalUsed).toFixed(4)),
    totalTokens, providers
  };
}

function providerAliases(key) {
  if (key === 'claude') return ['claude', 'anthropic', 'openrouter'];
  if (key === 'openai') return ['openai'];
  if (key === 'ollama') return ['ollama', 'local'];
  return [key];
}

async function getProviderDetails(providerName, month, days) {
  const key = normalizeProvider(providerName);
  if (!PROVIDER_BUDGETS[key]) return { error: 'Unknown provider', validProviders: Object.keys(PROVIDER_BUDGETS) };

  const db = getDb();
  const { start, end } = resolveBounds(month, days);
  const aliases = providerAliases(key);

  const stats = db.prepare(`
    SELECT SUM(cost_usd) AS total_cost, SUM(total_tokens) AS total_tokens,
      SUM(prompt_tokens) AS input_tokens, SUM(completion_tokens) AS output_tokens, COUNT(*) AS request_count
    FROM cost_records
    WHERE recorded_at >= ? AND recorded_at < ?
      AND (${aliases.map(() => 'lower(provider) LIKE ?').join(' OR ')})
  `).get(start, end, ...aliases.map(a => `%${a}%`)) || {};

  const modelStats = db.prepare(`
    SELECT model AS name, SUM(cost_usd) AS cost, SUM(total_tokens) AS tokens, COUNT(*) AS requests
    FROM cost_records
    WHERE recorded_at >= ? AND recorded_at < ?
      AND (${aliases.map(() => 'lower(provider) LIKE ?').join(' OR ')})
    GROUP BY model ORDER BY cost DESC
  `).all(start, end, ...aliases.map(a => `%${a}%`));

  const budget    = PROVIDER_BUDGETS[key].budget;
  const totalCost = parseFloat((stats.total_cost || 0).toFixed(4));

  return {
    provider: key, budget, used: totalCost,
    remaining:     parseFloat((budget - totalCost).toFixed(4)),
    tokens: {
      total:  Math.round(stats.total_tokens  || 0),
      input:  Math.round(stats.input_tokens  || 0),
      output: Math.round(stats.output_tokens || 0)
    },
    request_count: stats.request_count || 0,
    models: modelStats.map(m => ({
      name: m.name, cost: parseFloat((m.cost || 0).toFixed(4)),
      tokens: m.tokens || 0, requests: m.requests || 0
    }))
  };
}

async function getDailyUsage(providerName, month, days) {
  const key = normalizeProvider(providerName);
  const db  = getDb();
  const { start, end } = resolveBounds(month, days);
  const aliases = providerAliases(key);

  const daily = db.prepare(`
    SELECT strftime('%Y-%m-%d', recorded_at) AS date,
      SUM(cost_usd) AS cost, SUM(total_tokens) AS tokens, COUNT(*) AS requests
    FROM cost_records
    WHERE recorded_at >= ? AND recorded_at < ?
      AND (${aliases.map(() => 'lower(provider) LIKE ?').join(' OR ')})
    GROUP BY strftime('%Y-%m-%d', recorded_at) ORDER BY date ASC
  `).all(start, end, ...aliases.map(a => `%${a}%`));

  return {
    provider: key,
    daily: daily.map(d => ({
      date: d.date, cost: parseFloat((d.cost || 0).toFixed(4)),
      tokens: d.tokens || 0, requests: d.requests || 0
    }))
  };
}

async function getModelsBreakdown(month, days) {
  const db = getDb();
  const { start, end } = resolveBounds(month, days);

  const models = db.prepare(`
    SELECT model AS name, provider,
      SUM(cost_usd) AS cost, SUM(prompt_tokens) AS input_tokens,
      SUM(completion_tokens) AS output_tokens, SUM(total_tokens) AS tokens,
      COUNT(*) AS requests, MAX(recorded_at) AS last_used
    FROM cost_records WHERE recorded_at >= ? AND recorded_at < ?
    GROUP BY model, provider ORDER BY cost DESC
  `).all(start, end);

  return {
    month: month || getCurrentMonth(),
    models: models.map(m => ({
      name: m.name, provider: normalizeProvider(m.provider),
      cost: parseFloat((m.cost || 0).toFixed(4)),
      tokens: { total: m.tokens || 0, input: m.input_tokens || 0, output: m.output_tokens || 0 },
      requests: m.requests || 0, last_used: m.last_used
    })),
    generated_at: new Date().toISOString()
  };
}

module.exports = { getDashboardSummary, getProviderDetails, getDailyUsage, getModelsBreakdown, normalizeProvider, PROVIDER_BUDGETS };
