/**
 * AI Executor — calls OpenRouter LLM to actually process tasks
 * Used by POST /api/tasks/:id/execute
 */

const http  = require('http');
const https = require('https');
const { loadPresetFile, extractSection } = require('./presets');

// ── Ollama config ─────────────────────────────────────────────────────────────
const OLLAMA_BASE_URL     = process.env.OLLAMA_BASE_URL     || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:7b';
const OLLAMA_MODELS = {
  pm:     process.env.OLLAMA_MODEL_PM     || DEFAULT_OLLAMA_MODEL,
  rnd:    process.env.OLLAMA_MODEL_RND    || DEFAULT_OLLAMA_MODEL,
  worker: process.env.OLLAMA_MODEL_WORKER || DEFAULT_OLLAMA_MODEL,
};

const OPENROUTER_HOST = 'openrouter.ai';

// Default model per agent type — cheap & fast by default
const DEFAULT_MODELS = {
  pm:     'anthropic/claude-haiku-4-5-20251001',
  rnd:    'anthropic/claude-sonnet-4-6',
  worker: 'anthropic/claude-haiku-4-5-20251001',
};

// Cost per 1M tokens (fallback pricing)
const TOKEN_PRICING = {
  'anthropic/claude-haiku-4-5-20251001': { prompt: 0.80,  completion: 4.0  },
  'anthropic/claude-sonnet-4-6':         { prompt: 3.00,  completion: 15.0 },
  'anthropic/claude-opus-4-6':           { prompt: 15.00, completion: 75.0 },
  'openai/gpt-4o':                       { prompt: 2.50,  completion: 10.0 },
  'openai/gpt-4o-mini':                  { prompt: 0.15,  completion: 0.60 },
  'openai/gpt-4.1':                      { prompt: 2.00,  completion: 8.0  },
  'moonshot/kimi-k2-turbo':              { prompt: 0.30,  completion: 1.20 },
};

// ── HTTP call to Ollama (/api/chat, non-streaming) ────────────────────────────
function callOllama(messages, model) {
  return new Promise((resolve, reject) => {
    let base;
    try { base = new URL(OLLAMA_BASE_URL); } catch (e) { return reject(new Error(`Invalid OLLAMA_BASE_URL: ${OLLAMA_BASE_URL}`)); }

    const isHttps = base.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const body    = JSON.stringify({ model, messages, stream: false });
    const pathPrefix = base.pathname.replace(/\/$/, '');

    const opts = {
      hostname: base.hostname,
      port:     base.port || (isHttps ? 443 : 80),
      path:     `${pathPrefix}/api/chat`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Ollama HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Ollama parse error: ${e.message} — raw: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Check if Ollama is reachable (1.5 s timeout) ─────────────────────────────
function isOllamaReachable() {
  return new Promise(resolve => {
    try {
      const base    = new URL(OLLAMA_BASE_URL);
      const isHttps = base.protocol === 'https:';
      const lib     = isHttps ? https : http;

      const req = lib.request({
        hostname: base.hostname,
        port:     base.port || (isHttps ? 443 : 80),
        path:     '/api/tags',
        method:   'GET',
        timeout:  1500,
      }, res => {
        resolve(res.statusCode < 500);
        res.resume();
      });

      req.on('error',   () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

// ── HTTP call to OpenRouter ───────────────────────────────────────────────────
function callOpenRouter(messages, model, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    const opts = {
      hostname: OPENROUTER_HOST,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'HTTP-Referer': 'https://project-claw.local',
        'X-Title': 'PROJECT-CLAW',
      },
    };

    const reqHttp = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} — raw: ${data.substring(0, 100)}`));
        }
      });
    });

    reqHttp.on('error', reject);
    reqHttp.write(body);
    reqHttp.end();
  });
}

// ── Preset content extraction ────────────────────────────────────────────────
const MAX_PRESET_CHARS = 2000;

/**
 * Load a preset and extract specific sections.
 * Returns formatted string or '' if preset not found.
 */
function getPresetContent(type, name, sectionNames) {
  const content = loadPresetFile(type, name);
  if (!content) return '';

  const parts = [];
  for (const sec of sectionNames) {
    const body = extractSection(content, sec);
    if (body) parts.push(`### ${sec}\n${body}`);
  }
  if (!parts.length) return '';

  let combined = parts.join('\n\n');
  if (combined.length > MAX_PRESET_CHARS) {
    combined = combined.substring(0, MAX_PRESET_CHARS).replace(/\n[^\n]*$/, '') + '\n...';
  }
  return combined;
}

// ── System prompt per agent type ─────────────────────────────────────────────
function buildSystemPrompt(agent, project) {
  const type = agent.agent_type || 'worker';
  const skills = (() => {
    try { return JSON.parse(agent.skills || '[]'); } catch { return []; }
  })();

  const projectCtx = project
    ? `\nProject: ${project.name}${project.description ? `\nContext: ${project.description}` : ''}`
    : '';

  if (type === 'pm') {
    const modeLabel = agent.current_mode ? agent.current_mode.replace(/_/g, ' ').toUpperCase() : '';
    const presetBlock = agent.current_mode
      ? getPresetContent('pm_mode', agent.current_mode, ['Overview', 'Architecture Template', 'Team Composition', 'Model Recommendations'])
      : '';
    const presetSection = presetBlock
      ? `\n\nYou are operating in ${modeLabel} project mode.\n\n${presetBlock}`
      : '';

    return `You are ${agent.name}, a Project Manager AI agent${modeLabel ? ` running in ${modeLabel} mode` : ''}.

Your responsibilities: Break work into clear deliverables, identify dependencies, define acceptance criteria, coordinate team effort.${projectCtx}

Respond with structured, actionable output. Use markdown. Be concise and specific — not theoretical.${presetSection}`;
  }

  if (type === 'rnd') {
    const division = (agent.rnd_division || 'general research').replace(/_/g, ' ');
    const presetBlock = agent.rnd_division
      ? getPresetContent('rnd_division', agent.rnd_division, ['Purpose', 'Research Sources', 'Output Format'])
      : '';
    const presetSection = presetBlock
      ? `\n\nYou are an R&D agent specializing in ${division.toUpperCase()}.\n\n${presetBlock}`
      : '';

    return `You are ${agent.name}, an R&D Research agent specializing in ${division}.

Your responsibilities: Research emerging solutions, evaluate technologies, surface insights and recommendations.${projectCtx}

Respond with findings, analysis, and concrete recommendations. Cite specific technologies, tools, or approaches. Use markdown.${presetSection}`;
  }

  // Worker
  const roleLabel = (agent.role || 'developer').replace(/_/g, ' ');
  const skillsStr = skills.length ? ` Expert in: ${skills.slice(0, 5).join(', ')}.` : '';
  const dept = agent.current_mode || '';
  const presetBlock = dept
    ? getPresetContent('worker_dept', dept, ['Role Definition', 'Tools & Technologies', 'Standards & Best Practices', 'Communication Protocol'])
    : '';
  const presetSection = presetBlock
    ? `\n\nYou are a ${dept.replace(/_/g, ' ').toUpperCase()} specialist.\n\n${presetBlock}`
    : '';

  return `You are ${agent.name}, a ${roleLabel} AI agent.${skillsStr}

Your responsibilities: Implement features, write code, solve technical problems, deliver working solutions.${projectCtx}

Respond with concrete technical output — code, configuration, implementation steps, or technical specs. Use markdown with code blocks where relevant.${presetSection}`;
}

// ── Select model ──────────────────────────────────────────────────────────────
function selectModel(agent) {
  if (agent.current_model) return agent.current_model;
  return DEFAULT_MODELS[agent.agent_type || 'worker'] || DEFAULT_MODELS.worker;
}

// ── Calculate cost from token usage ──────────────────────────────────────────
function estimateCost(model, promptTokens, completionTokens) {
  const pricing = TOKEN_PRICING[model] || { prompt: 1.0, completion: 3.0 };
  const promptCost      = (promptTokens     / 1_000_000) * pricing.prompt;
  const completionCost  = (completionTokens / 1_000_000) * pricing.completion;
  return {
    prompt_cost:     promptCost,
    completion_cost: completionCost,
    total_cost:      promptCost + completionCost,
    pricing,
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────
async function executeTask(task, agent, project) {
  const apiKey     = process.env.OPENROUTER_API_KEY;
  const aiProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase();

  // Build messages once — shared by all providers
  const systemPrompt = buildSystemPrompt(agent, project);
  const userMessage  = [
    `Complete this task:`,
    ``,
    `**Title:** ${task.title}`,
    task.description ? `**Description:** ${task.description}` : null,
    `**Priority:** ${task.priority || 'normal'}`,
    ``,
    `Deliver the actual output. Be specific and actionable.`,
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];

  // Resolve effective provider
  let provider = aiProvider;
  if (provider === 'auto') {
    if (await isOllamaReachable()) {
      provider = 'ollama';
    } else if (apiKey) {
      provider = 'openrouter';
    } else {
      provider = 'simulation';
    }
  } else if (provider === 'openrouter' && !apiKey) {
    provider = 'simulation';
  }

  // ── Simulation ───────────────────────────────────────────────────────────
  if (provider === 'simulation') {
    const reason = aiProvider === 'openrouter'
      ? 'no OPENROUTER_API_KEY'
      : 'Ollama unreachable and no OPENROUTER_API_KEY';
    return {
      success:  true,
      skipped:  true,
      provider: 'simulation',
      result:   `[SIMULATED — ${reason}]\n\n**${agent.name}** completed task: _${task.title}_\n\nTo enable real AI execution, set AI_PROVIDER=ollama (with Ollama running) or set OPENROUTER_API_KEY in api-server/.env`,
      model:    null,
      tokens:   null,
      cost:     null,
    };
  }

  // ── Ollama ────────────────────────────────────────────────────────────────
  if (provider === 'ollama') {
    const agentType   = agent.agent_type || 'worker';
    const ollamaModel = OLLAMA_MODELS[agentType] || DEFAULT_OLLAMA_MODEL;
    const response    = await callOllama(messages, ollamaModel);
    const content     = response.message?.content || '(no output)';
    const promptTokens     = response.prompt_eval_count || 0;
    const completionTokens = response.eval_count        || 0;

    return {
      success:  true,
      skipped:  false,
      provider: 'ollama',
      result:   content,
      model:    ollamaModel,
      tokens: {
        prompt:     promptTokens,
        completion: completionTokens,
        total:      promptTokens + completionTokens,
      },
      cost: { prompt_cost: 0, completion_cost: 0, total_cost: 0, pricing: { prompt: 0, completion: 0 } },
    };
  }

  // ── OpenRouter ────────────────────────────────────────────────────────────
  const model    = selectModel(agent);
  const response = await callOpenRouter(messages, model, apiKey);

  const content          = response.choices?.[0]?.message?.content || '(no output)';
  const usage            = response.usage || {};
  const promptTokens     = usage.prompt_tokens     || 0;
  const completionTokens = usage.completion_tokens || 0;
  const cost             = estimateCost(model, promptTokens, completionTokens);

  return {
    success:  true,
    skipped:  false,
    provider: 'openrouter',
    result:   content,
    model,
    tokens: {
      prompt:     promptTokens,
      completion: completionTokens,
      total:      promptTokens + completionTokens,
    },
    cost,
  };
}

module.exports = { executeTask, callOpenRouter, callOllama, isOllamaReachable, buildSystemPrompt, selectModel, estimateCost, TOKEN_PRICING };
