/**
 * OpenRouter API Integration
 * Fetches real usage data and costs
 */

const https = require('https');
const { getDb, generateId } = require('./database');

const OPENROUTER_API_URL = 'api.openrouter.ai';

// Model pricing (per 1M tokens) - fallback if API doesn't return
const MODEL_PRICING = {
  'moonshot/kimi-k2.5': { prompt: 0.5, completion: 2.0 },
  'moonshot/kimi-k2-turbo': { prompt: 0.3, completion: 1.2 },
  'openai/gpt-5.1': { prompt: 2.0, completion: 8.0 },
  'openai/gpt-4o': { prompt: 2.5, completion: 10.0 },
  'anthropic/claude-3-5-sonnet': { prompt: 3.0, completion: 15.0 },
  'anthropic/claude-3-opus': { prompt: 15.0, completion: 75.0 },
  'google/gemini-pro': { prompt: 0.5, completion: 1.5 },
  'meta-llama/llama-3.1-405b': { prompt: 2.0, completion: 2.0 },
};

/**
 * Make authenticated request to OpenRouter API
 */
function openRouterRequest(path, method = 'GET', data = null) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: OPENROUTER_API_URL,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://project-claw.local',
        'X-Title': 'PROJECT-CLAW'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`OpenRouter API error: ${parsed.error?.message || responseData}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Fetch usage data from OpenRouter
 */
async function fetchOpenRouterUsage(startDate = null, endDate = null) {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  
  try {
    const response = await openRouterRequest(`/api/v1/usage${queryString}`);
    return response.data || [];
  } catch (err) {
    console.error('Error fetching OpenRouter usage:', err.message);
    throw err;
  }
}

/**
 * Fetch credits/remaining balance
 */
async function fetchOpenRouterCredits() {
  try {
    const response = await openRouterRequest('/api/v1/credits');
    return {
      total_credits: response.data?.total_credits || 0,
      total_usage: response.data?.total_usage || 0,
      remaining: (response.data?.total_credits || 0) - (response.data?.total_usage || 0)
    };
  } catch (err) {
    console.error('Error fetching OpenRouter credits:', err.message);
    throw err;
  }
}

/**
 * Calculate cost based on tokens and model
 */
function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model] || { prompt: 1.0, completion: 3.0 };
  
  const promptCost = (promptTokens / 1000000) * pricing.prompt;
  const completionCost = (completionTokens / 1000000) * pricing.completion;
  
  return {
    promptCost,
    completionCost,
    totalCost: promptCost + completionCost,
    pricing
  };
}

/**
 * Sync usage data from OpenRouter to local database
 */
async function syncOpenRouterUsage(options = {}) {
  const db = getDb();
  const { days = 30, projectId = null } = options;
  
  // Get last sync state
  const syncState = db.prepare('SELECT * FROM openrouter_sync WHERE id = ?').get('latest');
  
  // Calculate date range
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    // Update sync status
    db.prepare(`
      UPDATE openrouter_sync 
      SET sync_status = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run('syncing', 'latest');
    
    // Fetch usage data
    const usageData = await fetchOpenRouterUsage(startDate, endDate);
    
    let recordsSynced = 0;
    
    for (const record of usageData) {
      // Skip if already exists
      const existing = db.prepare('SELECT id FROM cost_records WHERE request_id = ?').get(record.id);
      if (existing) continue;
      
      // Calculate cost
      const costCalc = calculateCost(
        record.model,
        record.prompt_tokens || 0,
        record.completion_tokens || 0
      );
      
      // Insert cost record
      db.prepare(`
        INSERT INTO cost_records (
          id, project_id, user_id, model, provider,
          prompt_tokens, completion_tokens, total_tokens,
          cost_usd, cost_per_1k_prompt, cost_per_1k_completion,
          request_id, is_cached, metadata, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateId(),
        projectId || record.project_id || null,
        record.user_id || null,
        record.model,
        'openrouter',
        record.prompt_tokens || 0,
        record.completion_tokens || 0,
        (record.prompt_tokens || 0) + (record.completion_tokens || 0),
        costCalc.totalCost,
        costCalc.pricing.prompt / 1000,
        costCalc.pricing.completion / 1000,
        record.id,
        record.is_cached ? 1 : 0,
        JSON.stringify(record.metadata || {}),
        record.created_at || new Date().toISOString()
      );
      
      recordsSynced++;
    }
    
    // Update sync state
    db.prepare(`
      UPDATE openrouter_sync 
      SET 
        last_sync_at = datetime('now'),
        total_records_synced = total_records_synced + ?,
        sync_status = ?,
        error_message = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(recordsSynced, 'idle', 'latest');
    
    console.log(`✅ Synced ${recordsSynced} records from OpenRouter`);
    
    return {
      success: true,
      records_synced: recordsSynced,
      date_range: { start: startDate, end: endDate }
    };
    
  } catch (err) {
    // Update sync state with error
    db.prepare(`
      UPDATE openrouter_sync 
      SET sync_status = ?, error_message = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run('error', err.message, 'latest');
    
    throw err;
  }
}

/**
 * Get actual costs with filtering
 */
async function getActualCosts(options = {}) {
  const db = getDb();
  const {
    project_id,
    user_id,
    model,
    from,
    to,
    group_by = 'day',
    limit = 100,
    offset = 0
  } = options;
  
  let dateFormat;
  switch (group_by) {
    case 'week':
      dateFormat = "%Y-%W";
      break;
    case 'month':
      dateFormat = "%Y-%m";
      break;
    case 'hour':
      dateFormat = "%Y-%m-%d %H:00";
      break;
    case 'day':
    default:
      dateFormat = "%Y-%m-%d";
  }
  
  // Build query
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }
  
  if (user_id) {
    whereClause += ' AND user_id = ?';
    params.push(user_id);
  }
  
  if (model) {
    whereClause += ' AND model = ?';
    params.push(model);
  }
  
  if (from) {
    whereClause += ' AND recorded_at >= ?';
    params.push(from);
  }
  
  if (to) {
    whereClause += ' AND recorded_at <= ?';
    params.push(to);
  }
  
  // Get grouped data
  const query = `
    SELECT 
      strftime('${dateFormat}', recorded_at) as period,
      COUNT(*) as request_count,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(total_tokens) as total_tokens,
      ROUND(SUM(cost_usd), 6) as total_cost_usd,
      GROUP_CONCAT(DISTINCT model) as models_used
    FROM cost_records
    ${whereClause}
    GROUP BY strftime('${dateFormat}', recorded_at)
    ORDER BY period DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(parseInt(limit), parseInt(offset));
  
  const records = db.prepare(query).all(...params);
  
  // Get grand total
  const totalQuery = `
    SELECT 
      COUNT(*) as total_requests,
      SUM(total_tokens) as total_tokens,
      ROUND(SUM(cost_usd), 6) as total_cost_usd
    FROM cost_records
    ${whereClause.replace('LIMIT ? OFFSET ?', '')}
  `;
  
  const grandTotal = db.prepare(totalQuery).get(...params.slice(0, -2));
  
  // Get per-model breakdown
  const modelQuery = `
    SELECT 
      model,
      COUNT(*) as request_count,
      SUM(prompt_tokens) as prompt_tokens,
      SUM(completion_tokens) as completion_tokens,
      SUM(total_tokens) as total_tokens,
      ROUND(SUM(cost_usd), 6) as cost_usd
    FROM cost_records
    ${whereClause}
    GROUP BY model
    ORDER BY cost_usd DESC
  `;
  
  const modelBreakdown = db.prepare(modelQuery).all(...params.slice(0, -2));
  
  return {
    records: records.map(r => ({
      ...r,
      models_used: r.models_used ? r.models_used.split(',') : []
    })),
    grand_total: {
      requests: grandTotal.total_requests || 0,
      tokens: grandTotal.total_tokens || 0,
      cost_usd: grandTotal.total_cost_usd || 0
    },
    model_breakdown: modelBreakdown,
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      has_more: records.length === parseInt(limit)
    }
  };
}

/**
 * Get budget vs actual comparison
 */
async function getBudgetVsActual(options = {}) {
  const db = getDb();
  const { project_id, period = 'monthly' } = options;
  
  // Get active budgets
  let budgetQuery = 'SELECT * FROM budgets WHERE is_active = 1';
  const budgetParams = [];
  
  if (project_id) {
    budgetQuery += ' AND project_id = ?';
    budgetParams.push(project_id);
  }
  
  const budgets = db.prepare(budgetQuery).all(...budgetParams);
  
  // Calculate actual spend for each budget
  const results = budgets.map(budget => {
    // Determine date range based on budget period
    const now = new Date();
    let periodStart, periodEnd;
    
    switch (budget.budget_period) {
      case 'daily':
        periodStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        periodEnd = new Date(now.setHours(23, 59, 59, 999)).toISOString();
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        periodStart = weekStart.toISOString();
        periodEnd = new Date().toISOString();
        break;
      case 'yearly':
        periodStart = new Date(now.getFullYear(), 0, 1).toISOString();
        periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
        break;
      case 'monthly':
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    }
    
    // Get actual spend
    const actualQuery = `
      SELECT COALESCE(ROUND(SUM(cost_usd), 6), 0) as actual_spend
      FROM cost_records
      WHERE project_id = ? AND recorded_at >= ? AND recorded_at <= ?
    `;
    
    const { actual_spend } = db.prepare(actualQuery).get(
      budget.project_id, 
      periodStart, 
      periodEnd
    );
    
    const actualSpend = actual_spend || 0;
    const budgetAmount = budget.budget_amount;
    const percentage = budgetAmount > 0 ? (actualSpend / budgetAmount) : 0;
    
    return {
      budget_id: budget.id,
      project_id: budget.project_id,
      name: budget.name,
      budget_period: budget.budget_period,
      budget_amount: budgetAmount,
      actual_spend: actualSpend,
      remaining: Math.max(0, budgetAmount - actualSpend),
      percentage_used: Math.round(percentage * 100 * 100) / 100,
      alert_threshold: budget.alert_threshold,
      alert_triggered: percentage >= budget.alert_threshold,
      period_start: periodStart,
      period_end: periodEnd
    };
  });
  
  return {
    comparisons: results,
    summary: {
      total_budgets: results.length,
      total_budget_amount: results.reduce((sum, r) => sum + r.budget_amount, 0),
      total_actual_spend: results.reduce((sum, r) => sum + r.actual_spend, 0),
      alerts_triggered: results.filter(r => r.alert_triggered).length
    }
  };
}

/**
 * Get per-model cost breakdown
 */
async function getModelCosts(options = {}) {
  const db = getDb();
  const { from, to, project_id } = options;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }
  
  if (from) {
    whereClause += ' AND recorded_at >= ?';
    params.push(from);
  }
  
  if (to) {
    whereClause += ' AND recorded_at <= ?';
    params.push(to);
  }
  
  // Model summary
  const summaryQuery = `
    SELECT 
      model,
      COUNT(*) as total_requests,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(total_tokens) as total_tokens,
      ROUND(SUM(cost_usd), 6) as total_cost_usd,
      ROUND(AVG(cost_usd), 6) as avg_cost_per_request,
      MIN(recorded_at) as first_used,
      MAX(recorded_at) as last_used
    FROM cost_records
    ${whereClause}
    GROUP BY model
    ORDER BY total_cost_usd DESC
  `;
  
  const models = db.prepare(summaryQuery).all(...params);
  
  // Daily breakdown per model
  const dailyQuery = `
    SELECT 
      model,
      strftime('%Y-%m-%d', recorded_at) as date,
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      ROUND(SUM(cost_usd), 6) as cost_usd
    FROM cost_records
    ${whereClause}
    GROUP BY model, strftime('%Y-%m-%d', recorded_at)
    ORDER BY date DESC, cost_usd DESC
  `;
  
  const dailyBreakdown = db.prepare(dailyQuery).all(...params);
  
  return {
    models: models.map(m => ({
      ...m,
      cost_percentage: 0 // Will be calculated below
    })),
    daily_breakdown: dailyBreakdown,
    summary: {
      total_models: models.length,
      total_requests: models.reduce((sum, m) => sum + m.total_requests, 0),
      total_cost: models.reduce((sum, m) => sum + m.total_cost_usd, 0)
    }
  };
}

module.exports = {
  fetchOpenRouterUsage,
  fetchOpenRouterCredits,
  syncOpenRouterUsage,
  getActualCosts,
  getBudgetVsActual,
  getModelCosts,
  calculateCost,
  MODEL_PRICING
};
