/**
 * Token Monitoring Module
 * Live DB queries — no hardcoded usage values
 * Budgets are config; everything else is real data
 */

const { getDb } = require('./database');

// Budget config (only hardcoded values — intentional)
const PROVIDER_BUDGETS = {
  kimi:   { budget: 55 },
  openai: { budget: 120 },
  claude: { budget: 100 }
};

function normalizeProvider(provider) {
  if (!provider) return 'unknown';
  const p = provider.toLowerCase().trim();
  if (p.includes('kimi') || p.includes('moonshot')) return 'kimi';
  if (p.includes('openai') || p.includes('gpt') || p.includes('o1') || p.includes('o3')) return 'openai';
  if (p.includes('claude') || p.includes('anthropic')) return 'claude';
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

async function getDashboardSummary(month) {
  const db = getDb();
  const { start, end } = getMonthBounds(month);

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

async function getProviderDetails(providerName, month) {
  const key = normalizeProvider(providerName);
  if (!PROVIDER_BUDGETS[key]) return { error: 'Unknown provider', validProviders: Object.keys(PROVIDER_BUDGETS) };

  const db = getDb();
  const { start, end } = getMonthBounds(month);

  const stats = db.prepare(`
    SELECT SUM(cost_usd) AS total_cost, SUM(total_tokens) AS total_tokens,
      SUM(prompt_tokens) AS input_tokens, SUM(completion_tokens) AS output_tokens, COUNT(*) AS request_count
    FROM cost_records WHERE provider = ? AND recorded_at >= ? AND recorded_at < ?
  `).get(key, start, end) || {};

  const modelStats = db.prepare(`
    SELECT model AS name, SUM(cost_usd) AS cost, SUM(total_tokens) AS tokens, COUNT(*) AS requests
    FROM cost_records WHERE provider = ? AND recorded_at >= ? AND recorded_at < ?
    GROUP BY model ORDER BY cost DESC
  `).all(key, start, end);

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

async function getDailyUsage(providerName, month) {
  const key = normalizeProvider(providerName);
  const db  = getDb();
  const { start, end } = getMonthBounds(month);

  const daily = db.prepare(`
    SELECT strftime('%Y-%m-%d', recorded_at) AS date,
      SUM(cost_usd) AS cost, SUM(total_tokens) AS tokens, COUNT(*) AS requests
    FROM cost_records WHERE provider = ? AND recorded_at >= ? AND recorded_at < ?
    GROUP BY strftime('%Y-%m-%d', recorded_at) ORDER BY date ASC
  `).all(key, start, end);

  return {
    provider: key,
    daily: daily.map(d => ({
      date: d.date, cost: parseFloat((d.cost || 0).toFixed(4)),
      tokens: d.tokens || 0, requests: d.requests || 0
    }))
  };
}

async function getModelsBreakdown(month) {
  const db = getDb();
  const { start, end } = getMonthBounds(month);

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
