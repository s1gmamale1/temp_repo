/**
 * Sub-Agent Spawning System
 * Spawns agents to respond to messages
 */

const { getDb, generateId } = require('./database');
const { getOrCreateDmChannel } = require('./chat');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Sub-agent response tracking
const pendingResponses = new Map();

/**
 * Register a new agent and auto-create DM channels with all users
 */
async function registerAgent(agentData) {
  const db = getDb();
  const { name, role, project_id, description, personality, config } = agentData;

  // Create agent
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO agents (id, project_id, name, role, description, personality, config, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, name, role, description || null, JSON.stringify(personality || {}), JSON.stringify(config || {}), now);

  // Auto-create DM channels with all users
  const users = db.prepare('SELECT id FROM users WHERE role IN (\"user\", \"admin\")').all();
  const dmChannels = [];

  for (const user of users) {
    try {
      const dmChannel = await getOrCreateDmChannel(user.id, id);
      dmChannels.push({
        user_id: user.id,
        channel_id: dmChannel.id
      });
    } catch (err) {
      console.error(`Failed to create DM channel for user ${user.id}:`, err);
    }
  }

  console.log(`✅ Agent ${name} registered with ${dmChannels.length} DM channels`);

  return {
    agent: {
      id,
      name,
      role,
      project_id,
      created_at: now
    },
    dm_channels: dmChannels
  };
}

/**
 * Spawn a sub-agent to handle a response
 */
async function spawnSubAgent(options) {
  const { agentId, userId, message, channel, context = {} } = options;
  
  const db = getDb();
  
  // Get agent details
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }
  
  // Get user details
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  
  // Generate request ID for tracking
  const requestId = generateId();
  const startTime = Date.now();
  
  // Build the prompt for the sub-agent
  const persona = getAgentPersona(agent);
  const prompt = buildAgentPrompt(persona, user, message, channel, context);
  
  // In a real implementation, this would:
  // 1. Call the actual sub-agent API
  // 2. Use the openclaw CLI to spawn an agent
  // 3. Or use a message queue
  
  // For now, simulate or call local CLI
  let response;
  
  if (process.env.ENABLE_REAL_SUBAGENTS === 'true') {
    response = await callSubAgentCli(prompt, agent);
  } else {
    response = await simulateAgentResponse(agent, message);
  }
  
  const responseTime = Date.now() - startTime;
  
  return {
    agentId: agent.id,
    agentName: agent.name,
    content: response,
    responseTime,
    requestId
  };
}

/**
 * Get agent persona/personality
 */
function getAgentPersona(agent) {
  const personas = {
    'Leonardo': 'You are Leonardo (Leo), the tactical leader of the TMNT. You are disciplined, focused, and always ready with a plan. You speak with authority and care about the team.',
    'Donatello': 'You are Donatello (Donnie), the tech genius of the TMNT. You are analytical, innovative, and love solving problems with technology. You speak with intelligence and often reference tech.',
    'Raphael': 'You are Raphael (Raph), the hot-headed warrior of the TMNT. You are passionate, direct, and sometimes sarcastic. You speak with intensity and don\'t mince words.',
    'Michelangelo': 'You are Michelangelo (Mikey), the fun-loving ninja of the TMNT. You are enthusiastic, creative, and love pizza. You speak with energy and often use slang.',
    'Splinter': 'You are Master Splinter, the wise mentor of the TMNT. You are patient, philosophical, and speak with ancient wisdom. You offer guidance and perspective.',
    'April': 'You are April O\'Neil, the resourceful ally of the TMNT. You are a skilled reporter, brave, and tech-savvy. You speak professionally but with warmth.'
  };
  
  // Parse agent personality from config if available
  let personality = personas[agent.name];
  
  if (!personality && agent.personality) {
    try {
      const parsed = JSON.parse(agent.personality);
      personality = parsed.description || parsed.persona;
    } catch (e) {
      // Use default
    }
  }
  
  return personality || `You are ${agent.name}, an AI assistant. Be helpful and concise.`;
}

/**
 * Build the full prompt for the agent
 */
function buildAgentPrompt(persona, user, message, channel, context) {
  return `
${persona}

Context:
- Channel: ${channel}
- User: ${user ? user.name : 'Unknown'}
- Message ID: ${context.message_id || 'N/A'}
- Is DM: ${context.is_dm ? 'Yes' : 'No'}

User Message:
"""${message}"""

Instructions:
1. Respond naturally as your character
2. Keep responses concise (1-3 sentences)
3. Be helpful and engaging
4. Stay in character at all times

Your Response:`;
}

/**
 * Call sub-agent via CLI (future implementation)
 */
async function callSubAgentCli(prompt, agent) {
  // This would call the openclaw CLI to spawn an agent
  // For now, return a placeholder
  
  // Example: 
  // const { stdout } = await execAsync(`openclaw agent spawn --prompt "${prompt}" --agent ${agent.name}`);
  // return stdout.trim();
  
  return simulateAgentResponse(agent, prompt);
}

/**
 * Simulate agent response (for development/testing)
 */
async function simulateAgentResponse(agent, message) {
  const responses = {
    'Leonardo': [
      "I've analyzed the situation. Here's my plan...",
      "Team, we need to focus and execute this precisely.",
      "Good question. Let me think through the tactical approach.",
      "Discipline and preparation will see us through."
    ],
    'Donatello': [
      "Interesting problem! I can engineer a solution for that.",
      "According to my calculations, this approach should work...",
      "I've been working on something that might help here.",
      "The tech solution would be to optimize the algorithm."
    ],
    'Raphael': [
      "Yeah, I got this. Let's get it done.",
      "Finally, some action! Here's what I think...",
      "Look, it's simple. Just do it this way.",
      "I've got a few choice words about this situation..."
    ],
    'Michelangelo': [
      "Cowabunga! That's an awesome question! 🍕",
      "Dude, totally! Let me help you out!",
      "This reminds me of the time we fought that mutant pizza...",
      "Party on! I've got just the thing for you!"
    ],
    'Splinter': [
      "Patience, my student. Let me share some wisdom...",
      "There is a lesson in everything we do.",
      "The path to understanding requires reflection.",
      "As I have taught you, approach this with balance."
    ],
    'April': [
      "From a reporter's perspective, here's what I think...",
      "I've seen something like this before. Here's my take:",
      "Let me investigate this and get back to you with facts.",
      "This is definitely newsworthy! Here's my analysis:"
    ]
  };
  
  const agentResponses = responses[agent.name] || [
    "I'm here to help!",
    "Let me assist you with that.",
    "Interesting question. Here's my response:",
    "I've got you covered!"
  ];
  
  // Simple keyword matching for slightly better responses
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
    return agentResponses[0];
  } else if (lowerMessage.includes('what') || lowerMessage.includes('why')) {
    return agentResponses[1];
  } else if (lowerMessage.includes('thank')) {
    return "You're welcome! Always here to help out.";
  }
  
  // Random response
  return agentResponses[Math.floor(Math.random() * agentResponses.length)];
}

/**
 * Get pending responses
 */
function getPendingResponse(requestId) {
  return pendingResponses.get(requestId);
}

/**
 * Complete a pending response
 */
function completeResponse(requestId, response) {
  pendingResponses.set(requestId, {
    status: 'completed',
    response,
    completedAt: new Date().toISOString()
  });
}

module.exports = {
  spawnSubAgent,
  getAgentPersona,
  getPendingResponse,
  completeResponse,
  registerAgent
};
