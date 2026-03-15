const cron = require('node-cron');
const { getDb } = require('./database');
const { loadPresetFile, extractSection } = require('./presets');

// Store active cron jobs keyed by agent ID
const activeJobs = new Map();

// Schedule parsing: convert preset schedule strings to cron expressions
const SCHEDULE_MAP = {
  'every_4h': '0 */4 * * *',
  'every_6h': '0 */6 * * *',
  'daily': '0 9 * * *',
  'weekly': '0 9 * * 1',
  'every_12h': '0 */12 * * *',
};

// Default schedules per division (from preset files)
const DIVISION_DEFAULTS = {
  ai_ml_research: 'every_6h',
  tech_frameworks: 'daily',
  security_intel: 'every_4h',
  oss_scout: 'daily',
  tooling_infra: 'weekly',
  competitive_intel: 'weekly',
};

// Default models per division (from spec)
const DIVISION_MODELS = {
  ai_ml_research: 'claude-haiku-4-5',
  tech_frameworks: 'claude-haiku-4-5',
  security_intel: 'claude-sonnet-4-6',
  oss_scout: 'claude-haiku-4-5',
  tooling_infra: 'claude-haiku-4-5',
  competitive_intel: 'claude-haiku-4-5',
};

/**
 * Get the cron expression for an agent's schedule
 */
function getCronExpression(agent) {
  const schedule = agent.rnd_schedule || DIVISION_DEFAULTS[agent.rnd_division] || 'daily';
  // If it looks like a cron expression already, use it
  if (schedule.includes('*') || schedule.split(' ').length >= 5) {
    return schedule;
  }
  return SCHEDULE_MAP[schedule] || SCHEDULE_MAP['daily'];
}

/**
 * Execute R&D research for an agent
 */
async function executeRndResearch(agentId, wsManager) {
  const db = getDb();

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND agent_type = ?').get(agentId, 'rnd');
  if (!agent) {
    console.error(`[RND] Agent ${agentId} not found or not R&D type`);
    return null;
  }

  if (!agent.rnd_division) {
    console.error(`[RND] Agent ${agentId} has no rnd_division set`);
    return null;
  }

  console.log(`[RND] Executing research for ${agent.name} (${agent.rnd_division})...`);

  // Load preset content
  const presetContent = loadPresetFile('rnd_division', agent.rnd_division);
  const purpose = presetContent ? extractSection(presetContent, 'Purpose') : null;
  const sources = presetContent ? extractSection(presetContent, 'Research Sources') : null;
  const outputFormat = presetContent ? extractSection(presetContent, 'Output Format') : null;

  // Build research prompt
  const systemPrompt = [
    `You are an autonomous R&D agent specializing in ${agent.rnd_division.replace(/_/g, ' ')}.`,
    purpose ? `\n### Purpose\n${purpose}` : '',
    sources ? `\n### Research Sources\n${sources}` : '',
    `\n### Output Requirements`,
    outputFormat || 'Provide a structured research report.',
    `\nFormat your response as:`,
    `## Summary\n[Brief overview of findings]\n`,
    `## Impact Level\n[One of: low, medium, high, critical]\n`,
    `## Key Findings\n[Numbered list of discoveries]\n`,
    `## Affected Areas\n[Which presets or systems are affected]\n`,
    `## Recommended Actions\n[Specific actionable recommendations]\n`,
    `## Sources\n[List sources consulted]`,
  ].filter(Boolean).join('\n');

  const userPrompt = `Run your scheduled research scan for ${agent.rnd_division.replace(/_/g, ' ')}. Report any new developments, emerging tools, security issues, or notable changes since your last scan. Focus on actionable findings.`;

  // Get model for this division
  const model = agent.current_model || DIVISION_MODELS[agent.rnd_division] || 'claude-haiku-4-5';

  let result;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (apiKey) {
    // Real execution via OpenRouter
    try {
      const https = require('https');
      const data = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });

      result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'openrouter.ai',
          path: '/api/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://project-claw.ai',
            'X-Title': 'PROJECT-CLAW R&D',
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve({
                content: parsed.choices?.[0]?.message?.content || 'No response',
                model: parsed.model || model,
                tokens: {
                  prompt: parsed.usage?.prompt_tokens || 0,
                  completion: parsed.usage?.completion_tokens || 0,
                },
                cost: parsed.usage?.total_tokens ? (parsed.usage.total_tokens * 0.000001) : 0,
                skipped: false,
              });
            } catch (e) {
              reject(new Error('Failed to parse OpenRouter response'));
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    } catch (err) {
      console.error(`[RND] OpenRouter error for ${agent.name}:`, err.message);
      result = {
        content: `## Summary\nScheduled research scan completed (simulated - API error).\n\n## Impact Level\nlow\n\n## Key Findings\n1. API call failed: ${err.message}\n\n## Affected Areas\nNone\n\n## Recommended Actions\n1. Check OPENROUTER_API_KEY configuration\n\n## Sources\nN/A`,
        model,
        tokens: { prompt: 0, completion: 0 },
        cost: 0,
        skipped: true,
      };
    }
  } else {
    // Simulated result
    result = {
      content: `## Summary\nScheduled research scan for **${agent.rnd_division.replace(/_/g, ' ')}** completed (simulated — no OPENROUTER_API_KEY).\n\n## Impact Level\nlow\n\n## Key Findings\n1. Research scan simulation successful\n2. Set OPENROUTER_API_KEY in .env for real AI-powered research\n\n## Affected Areas\nNone (simulation mode)\n\n## Recommended Actions\n1. Configure OPENROUTER_API_KEY for production research\n\n## Sources\nN/A (simulation)`,
      model,
      tokens: { prompt: 0, completion: 0 },
      cost: 0,
      skipped: true,
    };
  }

  // Parse impact level from result
  const impactMatch = result.content.match(/##\s*Impact Level\s*\n\s*(low|medium|high|critical)/i);
  const impactLevel = impactMatch ? impactMatch[1].toLowerCase() : 'low';

  // Update last run timestamp
  db.prepare("UPDATE manager_agents SET rnd_last_run = datetime('now') WHERE id = ?").run(agentId);

  // Get or create rnd_feed channel
  let feedChannel = db.prepare("SELECT id FROM channels WHERE type = 'rnd_feed'").get();
  if (!feedChannel) {
    const { generateId } = require('./database');
    const channelId = generateId();
    db.prepare("INSERT INTO channels (id, name, type, created_at) VALUES (?, 'R&D Feed', 'rnd_feed', datetime('now'))").run(channelId);
    feedChannel = { id: channelId };
  }

  // Post findings to R&D Feed channel
  const { generateId } = require('./database');
  const messageId = generateId();
  const metadata = JSON.stringify({
    type: 'rnd_finding',
    division: agent.rnd_division,
    impact_level: impactLevel,
    model: result.model,
    tokens: result.tokens,
    cost: result.cost,
    skipped: result.skipped,
  });

  db.prepare(`
    INSERT INTO messages (id, channel_id, agent_id, content, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(messageId, feedChannel.id, agentId, result.content, metadata);

  // Record cost if not skipped
  if (!result.skipped && result.cost > 0) {
    db.prepare(`
      INSERT INTO cost_records (id, agent_id, model, prompt_tokens, completion_tokens, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(generateId(), agentId, result.model, result.tokens.prompt, result.tokens.completion, result.cost);
  }

  // Log activity
  try {
    db.prepare(`
      INSERT INTO activity_history (id, event_type, action, entity_id, entity_title, agent_id, agent_name, metadata, created_at)
      VALUES (?, 'agent', 'rnd_research_completed', ?, ?, ?, ?, ?, datetime('now'))
    `).run(generateId(), agentId, agent.rnd_division, agentId, agent.name, metadata);
  } catch (e) { /* non-critical */ }

  // Broadcast via WebSocket
  if (wsManager) {
    wsManager.broadcast({
      type: 'rnd:findings_posted',
      agent_id: agentId,
      agent_name: agent.name,
      division: agent.rnd_division,
      impact_level: impactLevel,
      message_id: messageId,
      channel_id: feedChannel.id,
    });
  }

  console.log(`[RND] ${agent.name} research complete. Impact: ${impactLevel}. Posted to R&D Feed.`);

  return {
    agent_id: agentId,
    agent_name: agent.name,
    division: agent.rnd_division,
    impact_level: impactLevel,
    message_id: messageId,
    channel_id: feedChannel.id,
    model: result.model,
    tokens: result.tokens,
    cost: result.cost,
    skipped: result.skipped,
  };
}

/**
 * Start the R&D scheduler — called once on server startup.
 * Queries all approved R&D agents and schedules their cron jobs.
 */
function startRndScheduler(wsManager) {
  const db = getDb();

  let rndAgents = [];
  try {
    rndAgents = db.prepare(`
      SELECT * FROM manager_agents
      WHERE agent_type = 'rnd' AND is_approved = 1
    `).all();
  } catch (e) {
    // Table or column may not exist yet
    console.warn('[RND] Could not query R&D agents:', e.message);
    return;
  }

  if (rndAgents.length === 0) {
    console.log('[RND] No approved R&D agents found. Scheduler idle.');
    return;
  }

  for (const agent of rndAgents) {
    scheduleAgent(agent, wsManager);
  }

  console.log(`[RND] Scheduler started for ${rndAgents.length} R&D agent(s).`);
}

/**
 * Schedule a single R&D agent's cron job
 */
function scheduleAgent(agent, wsManager) {
  // Stop existing job if any
  stopAgent(agent.id);

  const cronExpr = getCronExpression(agent);

  if (!cron.validate(cronExpr)) {
    console.error(`[RND] Invalid cron for ${agent.name}: ${cronExpr}`);
    return;
  }

  const job = cron.schedule(cronExpr, () => {
    executeRndResearch(agent.id, wsManager).catch(err => {
      console.error(`[RND] Scheduled execution failed for ${agent.name}:`, err.message);
    });
  });

  activeJobs.set(agent.id, job);
  console.log(`[RND] Scheduled ${agent.name} (${agent.rnd_division}): ${cronExpr}`);
}

/**
 * Stop a scheduled agent
 */
function stopAgent(agentId) {
  const job = activeJobs.get(agentId);
  if (job) {
    job.stop();
    activeJobs.delete(agentId);
  }
}

/**
 * Refresh scheduler — call when R&D agents are added/removed/updated
 */
function refreshScheduler(wsManager) {
  // Stop all
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();

  // Restart
  startRndScheduler(wsManager);
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  const db = getDb();

  let rndAgents = [];
  try {
    rndAgents = db.prepare(`
      SELECT id, name, rnd_division, rnd_schedule, rnd_last_run, status, is_approved
      FROM manager_agents
      WHERE agent_type = 'rnd'
    `).all();
  } catch (e) {
    return [];
  }

  return rndAgents.map(agent => ({
    ...agent,
    scheduled: activeJobs.has(agent.id),
    cron_expression: getCronExpression(agent),
    default_schedule: DIVISION_DEFAULTS[agent.rnd_division] || 'daily',
    model: DIVISION_MODELS[agent.rnd_division] || 'claude-haiku-4-5',
  }));
}

module.exports = {
  startRndScheduler,
  stopAgent,
  scheduleAgent,
  refreshScheduler,
  executeRndResearch,
  getSchedulerStatus,
  DIVISION_DEFAULTS,
  DIVISION_MODELS,
  SCHEDULE_MAP,
};
