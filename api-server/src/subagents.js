/**
 * Sub-Agent Spawning System
 * Spawns agents to respond to messages via LLM (OpenRouter) or simulation fallback
 */

const { getDb, generateId } = require('./database');
const { getOrCreateDmChannel } = require('./chat');
const { callOpenRouter, selectModel, estimateCost, TOKEN_PRICING } = require('./ai-executor');
const { storeTokenUsage } = require('./token-dashboard');

// Sub-agent response tracking
const pendingResponses = new Map();

// ── Agent Registration ──────────────────────────────────────────────────────
async function registerAgent(agentData) {
  const db = getDb();
  const { name, role, project_id, description, personality, config } = agentData;

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO agents (id, project_id, name, role, description, personality, config, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, name, role, description || null, JSON.stringify(personality || {}), JSON.stringify(config || {}), now);

  // Auto-create DM channels with all users
  const users = db.prepare('SELECT id FROM users WHERE role IN ("user", "admin")').all();
  const dmChannels = [];

  for (const user of users) {
    try {
      const dmChannel = await getOrCreateDmChannel(user.id, id);
      dmChannels.push({ user_id: user.id, channel_id: dmChannel.id });
    } catch (err) {
      console.error(`Failed to create DM channel for user ${user.id}:`, err);
    }
  }

  console.log(`[subagents] Agent ${name} registered with ${dmChannels.length} DM channels`);

  return {
    agent: { id, name, role, project_id, created_at: now },
    dm_channels: dmChannels,
  };
}

// ── Spawn Sub-Agent ─────────────────────────────────────────────────────────
async function spawnSubAgent(options) {
  const { agentId, userId, message, channel, context = {} } = options;
  const db = getDb();

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const requestId = generateId();
  const startTime = Date.now();

  const persona = getAgentPersona(agent);
  const systemPrompt = buildSystemPrompt(persona, agent);
  const userPrompt = buildUserPrompt(user, message, channel, context);

  let response;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (apiKey) {
    response = await callLLM(systemPrompt, userPrompt, agent, apiKey);
  } else {
    response = simulateAgentResponse(agent, message);
  }

  const responseTime = Date.now() - startTime;

  return {
    agentId: agent.id,
    agentName: agent.name,
    content: response.content,
    model: response.model || null,
    tokens: response.tokens || null,
    cost: response.cost || null,
    simulated: !apiKey,
    responseTime,
    requestId,
  };
}

// ── LLM Call via OpenRouter ─────────────────────────────────────────────────
async function callLLM(systemPrompt, userPrompt, agent, apiKey) {
  const model = agent.current_model || 'anthropic/claude-haiku-4-5-20251001';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const result = await callOpenRouter(messages, model, apiKey);

    const content = result.choices?.[0]?.message?.content || '(no response)';
    const usage = result.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const cost = estimateCost(model, promptTokens, completionTokens);

    // Record token usage for cost tracking
    try {
      await storeTokenUsage({
        model,
        provider: model.split('/')[0],
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: cost.total_cost,
      });
    } catch (e) {
      console.error('[subagents] Failed to record token usage:', e.message);
    }

    return {
      content,
      model,
      tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      cost,
    };
  } catch (err) {
    console.error(`[subagents] LLM call failed for ${agent.name}, falling back to simulation:`, err.message);
    return simulateAgentResponse(agent, userPrompt);
  }
}

// ── Prompt Builders ─────────────────────────────────────────────────────────
function getAgentPersona(agent) {
  // Check for custom personality in agent config
  if (agent.personality) {
    try {
      const parsed = JSON.parse(agent.personality);
      if (parsed.description || parsed.persona) {
        return parsed.description || parsed.persona;
      }
    } catch { /* use default */ }
  }

  // Default persona based on role
  const rolePersonas = {
    lead:    `You are ${agent.name}, a team lead AI agent. You are organized, decisive, and focused on delivering results. You coordinate tasks and keep the team aligned.`,
    pm:      `You are ${agent.name}, a project manager AI agent. You plan work, identify risks, break down tasks, and ensure timely delivery.`,
    worker:  `You are ${agent.name}, a technical worker AI agent. You implement features, write code, and solve engineering problems efficiently.`,
    rnd:     `You are ${agent.name}, an R&D research AI agent. You investigate new technologies, evaluate approaches, and provide data-driven recommendations.`,
  };

  return rolePersonas[agent.role] || `You are ${agent.name}, an AI assistant. Be helpful, concise, and professional.`;
}

function buildSystemPrompt(persona, agent) {
  return `${persona}

Rules:
- Respond naturally and concisely (1-4 sentences unless more detail is needed)
- Stay in character at all times
- Be helpful and actionable — avoid vague platitudes
- If asked about a task, give concrete next steps
- You may use markdown for code or structured output`;
}

function buildUserPrompt(user, message, channel, context) {
  const userName = user ? user.name : 'Unknown';
  const channelInfo = context.is_dm ? 'direct message' : `channel: ${channel}`;
  return `[${userName} in ${channelInfo}]: ${message}`;
}

// ── Simulation Fallback ─────────────────────────────────────────────────────
function simulateAgentResponse(agent, message) {
  const lowerMessage = (message || '').toLowerCase();

  // Context-aware simulated responses
  let content;
  if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
    content = `I can help with that. What specific aspect would you like me to focus on?`;
  } else if (lowerMessage.includes('status') || lowerMessage.includes('update')) {
    content = `Everything is on track. I'll flag any blockers as they come up.`;
  } else if (lowerMessage.includes('thank')) {
    content = `You're welcome! Let me know if you need anything else.`;
  } else if (lowerMessage.includes('task') || lowerMessage.includes('assign')) {
    content = `Got it. I'll review the requirements and get started right away.`;
  } else if (lowerMessage.includes('bug') || lowerMessage.includes('error') || lowerMessage.includes('fix')) {
    content = `I'll investigate this. Can you share any error logs or steps to reproduce?`;
  } else if (lowerMessage.includes('review') || lowerMessage.includes('feedback')) {
    content = `I'll take a look and get back to you with my feedback shortly.`;
  } else {
    const defaults = [
      `Understood. I'll look into this and follow up.`,
      `Good question — let me dig into that and get back to you.`,
      `On it. I'll have something for you soon.`,
      `Noted. I'll factor this into our current priorities.`,
    ];
    content = defaults[Math.floor(Math.random() * defaults.length)];
  }

  return {
    content: `[SIMULATED] ${content}`,
    model: null,
    tokens: null,
    cost: null,
  };
}

// ── Response Tracking ───────────────────────────────────────────────────────
function getPendingResponse(requestId) {
  return pendingResponses.get(requestId);
}

function completeResponse(requestId, response) {
  pendingResponses.set(requestId, {
    status: 'completed',
    response,
    completedAt: new Date().toISOString(),
  });
}

module.exports = {
  spawnSubAgent,
  getAgentPersona,
  getPendingResponse,
  completeResponse,
  registerAgent,
};
