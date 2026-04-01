/**
 * AI Executor — calls LLM / Claude Code CLI to actually process tasks
 * Used by POST /api/tasks/:id/execute
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { spawnSync, spawn } = require('child_process');
const { loadPresetFile, extractSection } = require('./presets');

// ── Claude Code CLI executor ──────────────────────────────────────────────────
const WORKSPACES_DIR  = path.resolve(__dirname, '../../workspaces');
const EXEC_LOGS_DIR   = path.resolve(__dirname, '../../logs/executions');

function ensureWorkspace(taskId) {
  const dir = path.join(WORKSPACES_DIR, taskId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listWorkspaceFiles(workspacePath) {
  try {
    return fs.readdirSync(workspacePath)
      .filter(f => !f.startsWith('.') && f !== 'node_modules');
  } catch { return []; }
}

function resolveToolsForAgent(agent) {
  const type   = agent.agent_type || 'worker';
  const skills = (() => { try { return JSON.parse(agent.skills || '[]'); } catch { return []; } })();
  const allSkills = [type, ...skills].map(s => s.toLowerCase());

  // PM and R&D agents: read-only by default — they plan and research, don't modify code
  if (type === 'pm')  return ['Read', 'Glob', 'Grep', 'Bash(echo:*)'];
  if (type === 'rnd') return ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

  // Workers with readonly skill: no writes or bash
  if (allSkills.includes('readonly')) return ['Read', 'Glob', 'Grep'];

  // Default worker: full access
  return null; // null = don't pass --allowedTools, Claude gets everything
}

function callClaudeCLI(prompt, workspacePath, toolsOverride, timeoutMs = 120000, onChunk = null) {
  const args = ['--print', '--dangerously-skip-permissions', '--input-format', 'text'];
  if (toolsOverride && toolsOverride.length > 0) {
    args.push('--allowedTools', toolsOverride.join(','));
  }

  // Streaming mode — used when live WS broadcast is needed
  if (onChunk) {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd:   workspacePath,
        env:   { ...process.env, FORCE_COLOR: '0' },
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Feed prompt via stdin
      proc.stdin.write(prompt);
      proc.stdin.end();

      let fullOutput = '';
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`claude timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on('data', chunk => {
        const text = chunk.toString();
        fullOutput += text;
        try { onChunk(text); } catch (_) {}
      });

      proc.stderr.on('data', chunk => {
        // Forward stderr as dimmed stream updates too
        try { onChunk(`\x1b[2m${chunk.toString()}\x1b[0m`); } catch (_) {}
      });

      proc.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !fullOutput) {
          reject(new Error(`claude exited ${code}`));
        } else {
          resolve(fullOutput.trim() || '(no output)');
        }
      });

      proc.on('error', err => { clearTimeout(timer); reject(err); });
    });
  }

  // Sync fallback (no streaming needed)
  const result = spawnSync('claude', args, {
    cwd:       workspacePath,
    input:     prompt,
    encoding:  'utf8',
    timeout:   timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env:       { ...process.env, FORCE_COLOR: '0' },
    shell:     true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`claude exited ${result.status}: ${stderr.substring(0, 400)}`);
  }
  return (result.stdout || '').trim() || '(no output)';
}

function saveExecutionLog(taskId, content) {
  try {
    if (!fs.existsSync(EXEC_LOGS_DIR)) fs.mkdirSync(EXEC_LOGS_DIR, { recursive: true });
    const logPath = path.join(EXEC_LOGS_DIR, `${taskId}.log`);
    fs.writeFileSync(logPath, content, 'utf8');
    return logPath;
  } catch { return null; }
}

function buildSessionContext(agent) {
  try {
    const state = JSON.parse(agent.session_state || '{}');
    if (!state.recent_work || state.recent_work.length === 0) return '';
    const lines = state.recent_work.slice(-3).map(w =>
      `- "${w.task}"${w.files?.length ? ` → created: ${w.files.join(', ')}` : ''}`
    );
    return `\nYour recent work history:\n${lines.join('\n')}\n`;
  } catch { return ''; }
}

// ── OpenClaw config ───────────────────────────────────────────────────────────
const OPENCLAW_AGENT_ID  = process.env.OPENCLAW_AGENT_ID  || 'main';
const OPENCLAW_TIMEOUT_S = parseInt(process.env.OPENCLAW_TIMEOUT_S || '120', 10);

// ── Ollama config ─────────────────────────────────────────────────────────────
const OLLAMA_BASE_URL     = process.env.OLLAMA_BASE_URL     || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:7b';
const OLLAMA_MODELS = {
  pm:     process.env.OLLAMA_MODEL_PM     || DEFAULT_OLLAMA_MODEL,
  rnd:    process.env.OLLAMA_MODEL_RND    || DEFAULT_OLLAMA_MODEL,
  worker: process.env.OLLAMA_MODEL_WORKER || DEFAULT_OLLAMA_MODEL,
};
const OLLAMA_NUM_PREDICT = parseInt(process.env.OLLAMA_NUM_PREDICT || '220', 10);
const OLLAMA_TEMPERATURE = parseFloat(process.env.OLLAMA_TEMPERATURE || '0.2');

const OPENROUTER_HOST = 'openrouter.ai';

// Default model per agent type
const DEFAULT_MODELS = {
  pm:     'anthropic/claude-opus-4-6',
  rnd:    'anthropic/claude-opus-4-6',
  worker: 'anthropic/claude-opus-4-6',
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

const OLLAMA_COST_PROMPT_PER_1M = parseFloat(process.env.OLLAMA_COST_PROMPT_PER_1M || '0');
const OLLAMA_COST_COMPLETION_PER_1M = parseFloat(process.env.OLLAMA_COST_COMPLETION_PER_1M || '0');

// ── HTTP call to Ollama (/api/chat, non-streaming) ────────────────────────────
function callOllama(messages, model, agentOllamaHost) {
  return new Promise((resolve, reject) => {
    const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || '45000', 10);
    const baseUrl = agentOllamaHost || OLLAMA_BASE_URL;
    let base;
    try { base = new URL(baseUrl); } catch (e) { return reject(new Error(`Invalid ollama host: ${baseUrl}`)); }

    const isHttps = base.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const body    = JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        num_predict: OLLAMA_NUM_PREDICT,
        temperature: OLLAMA_TEMPERATURE
      }
    });
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

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Ollama timeout after ${timeoutMs}ms`));
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

// ── OpenClaw subprocess call ──────────────────────────────────────────────────
function callOpenClaw(taskPrompt) {
  const result = spawnSync('openclaw', [
    'agent', '--agent', OPENCLAW_AGENT_ID,
    '--message', taskPrompt,
    '--json',
    '--timeout', String(OPENCLAW_TIMEOUT_S),
  ], {
    encoding:  'utf8',
    timeout:   (OPENCLAW_TIMEOUT_S + 30) * 1000,
    maxBuffer: 10 * 1024 * 1024,
    env:       { ...process.env },
    shell:     true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`openclaw agent exited ${result.status}: ${(result.stderr || '').trim()}`);
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== 'ok') throw new Error(`openclaw agent status: ${parsed.status}`);
  const agentMeta = parsed.result?.meta?.agentMeta || {};
  const text = (parsed.result?.payloads || []).map(p => p.text).filter(Boolean).join('\n\n');
  return {
    text,
    provider: agentMeta.provider || 'openclaw',
    model:    agentMeta.model    || 'unknown',
    usage:    agentMeta.usage    || {},
  };
}

// ── HTTP call to OpenRouter ───────────────────────────────────────────────────
function callOpenRouter(messages, model, apiKey) {
  return new Promise((resolve, reject) => {
    const timeoutMs = parseInt(process.env.OPENROUTER_TIMEOUT_MS || '45000', 10);
    // Restrict to Anthropic only — prevents OpenRouter from auto-routing to
    // OAuth-gated models (e.g. openai-codex/gpt-5.4) when primary model fails
    const providerRestriction = model && model.startsWith('anthropic/')
      ? { provider: { allow_fallbacks: false, order: ['Anthropic'] } }
      : {};
    const body = JSON.stringify({
      model,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
      ...providerRestriction,
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

    reqHttp.setTimeout(timeoutMs, () => {
      reqHttp.destroy(new Error(`OpenRouter timeout after ${timeoutMs}ms`));
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

function normalizeProvider(value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return null;
  if (v === 'claude' || v === 'claude-code' || v === 'claudecode') return 'claude';
  if (v === 'anthropic' || v === 'openrouter') return 'openrouter';
  if (v === 'ollama') return 'ollama';
  if (v === 'openclaw') return 'openclaw';
  if (v === 'auto' || v === 'simulation') return v;
  return null;
}

function normalizeModel(model, provider) {
  if (!model) return null;
  const m = String(model).trim();
  if (provider === 'openrouter') {
    if (m === 'claude-sonnet-4-6') return 'anthropic/claude-sonnet-4-6';
    if (m === 'claude-haiku-4-5') return 'anthropic/claude-haiku-4-5-20251001';
    if (m === 'claude-opus-4-6') return 'anthropic/claude-opus-4-6';
  }
  return m;
}

// ── Calculate cost from token usage ──────────────────────────────────────────
function estimateCost(model, promptTokens, completionTokens, pricingOverride = null) {
  const pricing = pricingOverride || TOKEN_PRICING[model] || { prompt: 1.0, completion: 3.0 };
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
async function executeTask(task, agent, project, onChunk = null) {
  const apiKey     = process.env.OPENROUTER_API_KEY;
  const envProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase();

  let payload = {};
  try { payload = JSON.parse(task.payload || '{}'); } catch { payload = {}; }

  const requestedProvider = normalizeProvider(payload.provider);
  const requestedModelRaw = payload.model || null;

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
  let provider = requestedProvider || envProvider;
  // Agent's ollama_host always wins — overrides even explicit AI_PROVIDER env setting
  if (agent.ollama_host) {
    provider = 'ollama';
  } else if (provider === 'auto') {
    const claudeCheck = spawnSync('claude', ['--version'], { shell: true, encoding: 'utf8', timeout: 5000 });
    if (claudeCheck.status === 0) {
      provider = 'claude';
    } else if (await isOllamaReachable()) {
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
    const reason = (requestedProvider || envProvider) === 'openrouter'
      ? 'no OPENROUTER_API_KEY'
      : 'Ollama unreachable and no OPENROUTER_API_KEY';
    return {
      success:  true,
      skipped:  true,
      provider: 'simulation',
      cost_mode: 'none',
      result:   `[SIMULATED — ${reason}]\n\n**${agent.name}** completed task: _${task.title}_\n\nTo enable real AI execution, set AI_PROVIDER=ollama (with Ollama running) or set OPENROUTER_API_KEY in api-server/.env`,
      model:    null,
      tokens:   null,
      cost:     null,
    };
  }

  // ── Ollama ────────────────────────────────────────────────────────────────
  if (provider === 'ollama') {
    const agentType   = agent.agent_type || 'worker';
    const ollamaModel = normalizeModel(requestedModelRaw, 'ollama') || agent.current_model || OLLAMA_MODELS[agentType] || DEFAULT_OLLAMA_MODEL;
    const response    = await callOllama(messages, ollamaModel, agent.ollama_host || null);
    const content     = response.message?.content || '(no output)';
    const promptTokens     = response.prompt_eval_count || 0;
    const completionTokens = response.eval_count        || 0;

    const cost = estimateCost(
      'ollama/local',
      promptTokens,
      completionTokens,
      { prompt: OLLAMA_COST_PROMPT_PER_1M, completion: OLLAMA_COST_COMPLETION_PER_1M }
    );

    return {
      success:  true,
      skipped:  false,
      provider: 'ollama',
      cost_mode: 'estimated',
      result:   content,
      model:    ollamaModel,
      tokens: {
        prompt:     promptTokens,
        completion: completionTokens,
        total:      promptTokens + completionTokens,
      },
      cost,
    };
  }

  // ── Claude Code CLI ───────────────────────────────────────────────────────
  if (provider === 'claude') {
    const workspacePath = ensureWorkspace(task.id);
    const agentTypeLabel = agent.agent_type === 'pm' ? 'Project Manager' :
                           agent.agent_type === 'rnd' ? 'R&D Researcher' : 'Worker';

    const sessionCtx = buildSessionContext(agent);

    const taskPrompt = [
      `You are ${agent.name}, an AI ${agentTypeLabel} agent.`,
      sessionCtx || null,
      `Project: ${project?.name || 'Unknown'}`,
      `Task: ${task.title}`,
      task.description ? `Description: ${task.description}` : null,
      `Priority: ${task.priority === 1 ? 'critical' : task.priority === 2 ? 'normal' : 'low'}`,
      ``,
      `Your working directory is: ${workspacePath}`,
      ``,
      `Complete this task. Write actual files, run code, and do real work using your tools.`,
      `When done, summarize what you did and list any files you created or modified.`,
    ].filter(Boolean).join('\n');

    const timeoutMs    = parseInt(process.env.CLAUDE_TIMEOUT_MS || '120000', 10);
    const allowedTools = resolveToolsForAgent(agent);
    const output = await callClaudeCLI(taskPrompt, workspacePath, allowedTools, timeoutMs, onChunk);
    const files = listWorkspaceFiles(workspacePath);
    const filesNote = files.length > 0
      ? `\n\n---\n**Workspace files:** ${files.join(', ')}`
      : '';

    const logPath = saveExecutionLog(task.id, output);

    return {
      success:        true,
      skipped:        false,
      provider:       'claude',
      cost_mode:      'none',
      result:         output + filesNote,
      model:          'claude-code',
      tokens:         null,
      cost:           null,
      workspace_path: workspacePath,
      log_path:       logPath,
      files_created:  files,
    };
  }

  // ── OpenClaw ──────────────────────────────────────────────────────────────
  if (provider === 'openclaw') {
    const taskPrompt = [
      `Complete this task as an expert ${agent.agent_type || 'worker'} agent:`,
      ``,
      `**Project:** ${project?.name || 'Unknown'}`,
      `**Task:** ${task.title}`,
      task.description ? `**Details:** ${task.description}` : null,
      `**Priority:** ${task.priority === 1 ? 'critical' : task.priority === 2 ? 'normal' : 'low'}`,
      ``,
      `Deliver concrete, actionable output. Be specific. Use markdown where helpful.`,
    ].filter(Boolean).join('\n');

    const oc = callOpenClaw(taskPrompt);
    const promptTokens     = oc.usage.input  || 0;
    const completionTokens = oc.usage.output || 0;
    const cost = estimateCost(oc.model, promptTokens, completionTokens,
      { prompt: 0, completion: 0 });

    return {
      success:   true,
      skipped:   false,
      provider:  'openclaw',
      cost_mode: 'none',
      result:    oc.text || '(no output)',
      model:     `openclaw/${oc.model}`,
      tokens: {
        prompt:     promptTokens,
        completion: completionTokens,
        total:      promptTokens + completionTokens,
      },
      cost,
    };
  }

  // ── OpenRouter ────────────────────────────────────────────────────────────
  const model    = normalizeModel(requestedModelRaw, 'openrouter') || selectModel(agent);
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
    cost_mode: 'actual',
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
