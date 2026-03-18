const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined
  },
  pluginTimeout: 10000,
  disableRequestLogging: false,
  genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
});

const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const websocket = require('@fastify/websocket');
const rateLimit = require('@fastify/rate-limit');
const { initDatabase, getDb } = require('./database');
const wsManager = require('./websocket');
const routes = require('./routes');
const { optionalAuthMiddleware, authMiddleware } = require('./auth');
const config = require('./config');
const { safeError, logError } = require('./errors');
const {
  validate,
  createProjectSchema,
  updateProjectStatusSchema,
  updateTaskSchema,
  recordCostSchema,
  createBudgetSchema,
  registerMachineSchema,
  registerUserSchema,
  registerAgentSchema,
  updateAgentSchema,
  updateAgentStatusSchema,
  editMessageSchema,
  recordTokenUsageSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  updateRndScheduleSchema,
} = require('./validators');
const authRoutes = require('./auth.routes');

const { initSentry, sentryErrorHandler, flushSentry } = require('./sentry');
const { initRedis, initSubscriber, closeRedis, getRateLimitStore, publish } = require('./redis');

const PORT = config.PORT;
const HOST = config.HOST;
const NODE_ENV = config.NODE_ENV;

// Track server start time for uptime
const SERVER_START_TIME = Date.now();

async function buildServer() {
  // Run env safety checks (warns on misconfigured provider/secret, non-fatal)
  const { runEnvChecks } = require('./env-check');
  runEnvChecks(fastify.log);

  // Initialize Sentry error tracking (optional — needs SENTRY_DSN)
  initSentry();

  // Initialize Redis (optional — needs REDIS_URL)
  await initRedis();

  // Initialize database
  await initDatabase();

  // Sync filesystem presets to database
  const { syncPresetsToDb } = require('./presets');
  const synced = syncPresetsToDb();
  if (synced > 0) fastify.log.info(`Synced ${synced} presets to database`);

  // Register security headers (Helmet)
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Don't block frontend assets
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Register rate limiting (uses Redis store if available, else in-memory)
  const rateLimitOpts = {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}`,
      retryAfter: context.after
    }),
  };
  const redisStore = getRateLimitStore();
  if (redisStore) {
    rateLimitOpts.redis = redisStore.client;
    console.log('[rate-limit] Using Redis store');
  }
  await fastify.register(rateLimit, rateLimitOpts);

  // Register CORS
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      const allowedOrigins = config.CORS_ORIGINS;

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        cb(null, true);
        return;
      }

      if (NODE_ENV === 'development' &&
        (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
        cb(null, true);
        return;
      }

      fastify.log.warn(`CORS blocked origin: ${origin}`);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  // Attach request ID to all responses
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // Global error handler — sanitize errors in production
  fastify.setErrorHandler(function (error, request, reply) {
    logError('unhandled', error, request);
    sentryErrorHandler(error, request, reply);

    const statusCode = error.statusCode || 500;
    reply.code(statusCode).send({
      error: statusCode === 400 ? error.message : safeError(error).error,
      requestId: request.id
    });
  });

  // Register WebSocket
  await fastify.register(websocket);

  // Attach wsManager to fastify so routes can access via request.server.websocketManager
  fastify.decorate('websocketManager', wsManager);

  // Request logging middleware
  fastify.addHook('onRequest', async (request, reply) => {
    request.log.info({
      req: {
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      }
    }, 'incoming request');
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info({
      res: {
        statusCode: reply.statusCode
      },
      responseTime: reply.elapsedTime
    }, 'request completed');
  });

  // Health checks
  fastify.get('/health', async () => {
    const db = getDb();
    let dbStatus = 'unknown';

    try {
      db.prepare('SELECT 1').get();
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = 'error';
      fastify.log.error('Health check DB error:', err);
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '1.2.0',
      database: dbStatus,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };
  });

  fastify.get('/ready', async () => {
    return { ready: true, timestamp: new Date().toISOString() };
  });

  fastify.get('/live', async () => {
    return { alive: true, timestamp: new Date().toISOString() };
  });

  // Serve agentCLI.js for easy download on remote machines
  fastify.get('/agentCLI.js', async (request, reply) => {
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(__dirname, '..', 'agentCLI.js');
    reply.header('Content-Type', 'application/javascript');
    reply.header('Content-Disposition', 'attachment; filename="agentCLI.js"');
    return reply.send(fs.createReadStream(filePath));
  });

  // ============================================================================
  // PROJECT ROUTES
  // ============================================================================
  fastify.get('/api/projects', { preHandler: authMiddleware }, routes.listProjects);
  fastify.post('/api/projects', { preHandler: [authMiddleware, validate(createProjectSchema)] }, routes.createProject);
  fastify.get('/api/projects/:id', { preHandler: optionalAuthMiddleware }, routes.getProject);
  fastify.get('/api/projects/:id/tasks', { preHandler: optionalAuthMiddleware }, routes.getProjectTasks);
  fastify.patch('/api/projects/:id/status', { preHandler: [authMiddleware, validate(updateProjectStatusSchema)] }, routes.updateProjectStatus);

  // ============================================================================
  // TASK ROUTES - PHASE 3
  // ============================================================================

  // Create task
  fastify.post('/api/tasks', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['project_id', 'title'],
        properties: {
          project_id: { type: 'string' },
          title: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 5000 },
          priority: { type: 'integer', minimum: 1, maximum: 5 },
          agent_id: { type: 'string' },
          due_date: { type: 'string' },
          estimated_hours: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          payload: { type: 'object' }
        }
      }
    }
  }, routes.createTask);

  // Get task by ID
  fastify.get('/api/tasks/:id', { preHandler: optionalAuthMiddleware }, routes.getTaskById);

  // Update task
  fastify.patch('/api/tasks/:id', { preHandler: [authMiddleware, validate(updateTaskSchema)] }, routes.updateTask);

  // Delete task
  fastify.delete('/api/tasks/:id', { preHandler: authMiddleware }, routes.deleteTask);

  // Assign task to agent
  fastify.post('/api/tasks/:id/assign', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: {
          agent_id: { type: 'string' },
          notify: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }, routes.assignTask);

  // Accept task
  fastify.post('/api/tasks/:id/accept', { preHandler: authMiddleware }, routes.acceptTask);

  // Reject task
  fastify.post('/api/tasks/:id/reject', { preHandler: authMiddleware }, routes.rejectTask);

  // Start task
  fastify.post('/api/tasks/:id/start', { preHandler: authMiddleware }, routes.startTask);

  // Complete task
  fastify.post('/api/tasks/:id/complete', { preHandler: authMiddleware }, routes.completeTask);

  // Execute task with AI
  fastify.post('/api/tasks/:id/execute', { preHandler: authMiddleware }, routes.executeTaskRoute);

  // Cancel task
  fastify.post('/api/tasks/:id/cancel', { preHandler: authMiddleware }, routes.cancelTask);

  // Add comment
  fastify.post('/api/tasks/:id/comments', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 }
        }
      }
    }
  }, routes.addTaskComment);

  // Task updates
  fastify.get('/api/tasks/:id/updates', { preHandler: authMiddleware }, routes.getTaskUpdates);
  fastify.post('/api/tasks/:id/updates', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 },
          update_type: { type: 'string', enum: ['progress', 'question', 'blocker', 'completion', 'system'] },
          is_public: { type: 'boolean' }
        }
      }
    }
  }, routes.addTaskUpdate);

  // Get agent tasks
  fastify.get('/api/agents/:id/tasks', { preHandler: authMiddleware }, routes.getAgentTasks);

  // Get my tasks (for current agent)
  fastify.get('/api/agents/me/tasks', { preHandler: authMiddleware }, routes.getMyTasks);

  // Search tasks
  fastify.get('/api/tasks', { preHandler: optionalAuthMiddleware }, routes.searchTasks);

  // ============================================================================
  // LEGACY COST ROUTES
  // ============================================================================
  fastify.get('/api/costs', { preHandler: optionalAuthMiddleware }, routes.getCosts);
  fastify.get('/api/costs/summary', { preHandler: optionalAuthMiddleware }, routes.getCostSummary);
  fastify.post('/api/costs', { preHandler: [authMiddleware, validate(recordCostSchema)] }, routes.recordCost);

  // ============================================================================
  // REAL COST TRACKING ROUTES (NEW)
  // ============================================================================
  fastify.get('/api/costs/actual', { preHandler: authMiddleware }, routes.getActualCostsRoute);
  fastify.get('/api/costs/live', { preHandler: authMiddleware }, routes.getLiveCostsRoute);
  fastify.post('/api/costs/sync', { preHandler: authMiddleware }, routes.syncCostsRoute);
  fastify.get('/api/costs/budget', { preHandler: authMiddleware }, routes.getBudgetVsActualRoute);
  fastify.get('/api/costs/models', { preHandler: authMiddleware }, routes.getModelCostsRoute);
  fastify.get('/api/costs/credits', { preHandler: authMiddleware }, routes.getCreditsRoute);
  fastify.get('/api/costs/agents', { preHandler: authMiddleware }, routes.getCostsByAgentRoute);

  // ============================================================================
  // MONITORING ROUTES
  // ============================================================================
  const tokenMonitoring = require('./token-monitoring');
  fastify.get('/api/monitoring/summary', { preHandler: authMiddleware }, async (req, reply) => {
    try { return await tokenMonitoring.getDashboardSummary(); }
    catch (err) { reply.code(500); return { error: err.message }; }
  });
  fastify.get('/api/monitoring/daily', { preHandler: authMiddleware }, async (req, reply) => {
    try { return await tokenMonitoring.getDailyUsage(req.query.provider, req.query.month); }
    catch (err) { reply.code(500); return { error: err.message }; }
  });

  // ============================================================================
  // TOKEN DASHBOARD ROUTES (Legacy)
  // ============================================================================
  fastify.get('/api/tokens/dashboard', { preHandler: authMiddleware }, routes.getTokensDashboardRoute);
  fastify.get('/api/tokens/live', { preHandler: authMiddleware }, routes.getTokensLiveRoute);
  fastify.get('/api/tokens/providers/:provider', { preHandler: authMiddleware }, routes.getTokensProviderRoute);
  fastify.get('/api/tokens/context', { preHandler: authMiddleware }, routes.getContextTokensRoute);
  fastify.get('/api/tokens/status', { preHandler: authMiddleware }, routes.getTokenStatusRoute);
  fastify.post('/api/tokens/record', { preHandler: [authMiddleware, validate(recordTokenUsageSchema)] }, routes.recordTokenUsageRoute);

  // ============================================================================
  // TOKEN MONITORING ROUTES (NEW - Per Leonardo's Spec)
  // ============================================================================
  fastify.get('/api/tokens/usage', { preHandler: authMiddleware }, routes.getTokensUsageRoute);
  fastify.get('/api/tokens/models', { preHandler: authMiddleware }, routes.getTokensModelsRoute);
  fastify.get('/api/tokens/monthly', { preHandler: authMiddleware }, routes.getTokensMonthlyRoute);

  // ============================================================================
  // BUDGET ROUTES
  // ============================================================================
  fastify.get('/api/budgets', { preHandler: authMiddleware }, routes.listBudgetsRoute);
  fastify.post('/api/budgets', { preHandler: [authMiddleware, validate(createBudgetSchema)] }, routes.createBudgetRoute);

  // ============================================================================
  // MACHINE ROUTES
  // ============================================================================
  fastify.get('/api/machines', { preHandler: authMiddleware }, routes.listMachinesRoute);
  fastify.get('/api/machines/health', { preHandler: authMiddleware }, routes.fleetHealthRoute);
  fastify.post('/api/machines/register', { preHandler: validate(registerMachineSchema) }, routes.registerMachineRoute);
  fastify.post('/api/machines/assign-agent', { preHandler: authMiddleware }, routes.autoAssignAgentRoute);
  fastify.delete('/api/machines/:id', { preHandler: authMiddleware }, routes.deleteMachineRoute);
  fastify.post('/api/machines/:machineId/agents/:agentId', { preHandler: authMiddleware }, routes.linkMachineAgentRoute);
  fastify.delete('/api/machines/:machineId/agents/:agentId', { preHandler: authMiddleware }, routes.unlinkMachineAgentRoute);

  // ============================================================================
  // CHANNEL ROUTES (NEW)
  // ============================================================================
  fastify.get('/api/channels', { preHandler: authMiddleware }, routes.listChannelsRoute);
  fastify.get('/api/channels/:id/messages', { preHandler: optionalAuthMiddleware }, routes.getChannelMessagesByIdRoute);
  fastify.post('/api/channels/:id/messages', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 10000 },
          metadata: { type: 'object' },
          agent_id: { type: 'string' }
        }
      }
    }
  }, routes.sendChannelMessageRoute);
  fastify.post('/api/channels/dm/:userId', { preHandler: authMiddleware }, routes.createOrGetDmRoute);
  fastify.post('/api/channels/project/:projectId', { preHandler: authMiddleware }, routes.createProjectChannelRoute);

  // ============================================================================
  // CHAT ROUTES (Legacy)
  // ============================================================================
  fastify.post('/api/messages', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 10000 },
          channel: { type: 'string', maxLength: 255 },
          agent_id: { type: 'string', format: 'uuid' },
          is_dm: { type: 'boolean' },
          metadata: { type: 'object' }
        }
      }
    }
  }, routes.sendMessageRoute);

  fastify.get('/api/messages/:channel', { preHandler: optionalAuthMiddleware }, routes.getChannelMessagesRoute);
  fastify.patch('/api/messages/:id', { preHandler: [authMiddleware, validate(editMessageSchema)] }, routes.editMessageRoute);
  fastify.delete('/api/messages/:id', { preHandler: authMiddleware }, routes.deleteMessageRoute);

  // DM Routes (Legacy)
  fastify.get('/api/dm', { preHandler: authMiddleware }, routes.getUserDmChannelsRoute);
  fastify.get('/api/dm/:agent_id', { preHandler: authMiddleware }, routes.getDmHistoryRoute);
  fastify.post('/api/dm/:agent_id', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 10000 },
          metadata: { type: 'object' }
        }
      }
    }
  }, routes.sendDmRoute);

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  fastify.post('/api/auth/telegram', routes.telegramAuthRoute);
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['login', 'password'],
        properties: {
          login: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 }
        }
      }
    }
  }, routes.loginRoute);
  fastify.post('/api/auth/logout', { preHandler: authMiddleware }, routes.logoutRoute);
  fastify.get('/api/auth/me', { preHandler: authMiddleware }, routes.getMeRoute);
  fastify.post('/api/auth/register', { preHandler: validate(registerUserSchema) }, routes.registerRoute);
  fastify.patch('/api/auth/me', { preHandler: [authMiddleware, validate(updateProfileSchema)] }, routes.updateProfileRoute);
  fastify.post('/api/auth/change-password', { preHandler: authMiddleware }, authRoutes.changePassword);
  fastify.get('/api/user/preferences', { preHandler: authMiddleware }, routes.getPreferencesRoute);
  fastify.put('/api/user/preferences', { preHandler: [authMiddleware, validate(updatePreferencesSchema)] }, routes.updatePreferencesRoute);

  // ============================================================================
  // MANAGER AGENT ROUTES (NEW)
  // ============================================================================
  fastify.get('/api/agents', { preHandler: authMiddleware }, routes.listManagerAgentsRoute);
  fastify.get('/api/agents/directory', { preHandler: authMiddleware }, routes.agentDirectoryRoute);
  fastify.get('/api/agents/chat', { preHandler: authMiddleware }, routes.getAgentsForChatRoute);
  fastify.get('/api/agents/:id', { preHandler: optionalAuthMiddleware }, routes.getManagerAgentRoute);
  fastify.post('/api/agents/register', { preHandler: validate(registerAgentSchema) }, routes.registerManagerAgentRoute);
  fastify.post('/api/agents/:id/approve', { preHandler: authMiddleware }, routes.approveManagerAgentRoute);
  fastify.post('/api/agents/:id/reject', { preHandler: authMiddleware }, routes.rejectManagerAgentRoute);
  fastify.post('/api/admin/agents/:id/approve', { preHandler: authMiddleware }, routes.approveManagerAgentRoute);
  fastify.post('/api/admin/agents/:id/reject', { preHandler: authMiddleware }, routes.rejectManagerAgentRoute);
  fastify.delete('/api/admin/agents/:id', { preHandler: authMiddleware }, routes.deleteManagerAgentRoute);
  fastify.get('/api/admin/agents/pending', { preHandler: authMiddleware }, routes.listPendingAgentsRoute);
  fastify.get('/api/admin/agents/approved', { preHandler: authMiddleware }, routes.listApprovedAgentsRoute);
  fastify.get('/api/admin/users', { preHandler: authMiddleware }, routes.listUsersRoute);
  fastify.post('/api/agents/:id/status', { preHandler: [authMiddleware, validate(updateAgentStatusSchema)] }, routes.updateManagerAgentStatusRoute);
  fastify.patch('/api/agents/:id', { preHandler: [authMiddleware, validate(updateAgentSchema)] }, routes.patchManagerAgentRoute);
  fastify.post('/api/agents/:id/heartbeat', { preHandler: optionalAuthMiddleware }, routes.agentHeartbeatRoute);
  fastify.get('/api/agents/:id/notifications', { preHandler: authMiddleware }, routes.getAgentNotificationsRoute);
  fastify.post('/api/agents/:id/notifications/:notificationId/read', { preHandler: authMiddleware }, routes.markAgentNotificationReadRoute);
  fastify.post('/api/agents/:id/message', { preHandler: authMiddleware }, routes.agentMessageRoute);

  // User notifications
  fastify.get('/api/notifications', { preHandler: authMiddleware }, routes.getNotificationsRoute);
  fastify.post('/api/notifications/:id/read', { preHandler: authMiddleware }, routes.markNotificationReadRoute);
  fastify.post('/api/notifications/read-all', { preHandler: authMiddleware }, routes.markAllNotificationsReadRoute);

  // Activity history
  fastify.get('/api/activity', { preHandler: authMiddleware }, routes.getActivityRoute);
  fastify.post('/api/agents/:id/projects/:projectId', { preHandler: authMiddleware }, routes.assignAgentToProjectRoute);
  fastify.delete('/api/agents/:id/projects/:projectId', { preHandler: authMiddleware }, routes.removeAgentFromProjectRoute);
  fastify.get('/api/agents/:id/projects', { preHandler: authMiddleware }, routes.getAgentProjectsRoute);

  // ============================================================================
  // PROJECT ASSIGNMENT ROUTES (Phase 2)
  // ============================================================================
  fastify.post('/api/projects/:id/assign-agent', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['agent_id'],
        properties: {
          agent_id: { type: 'string' },
          role: { type: 'string', enum: ['lead', 'contributor', 'observer'] }
        }
      }
    }
  }, routes.assignAgentToProjectRouteV2);
  fastify.delete('/api/projects/:id/agents/:agentId', { preHandler: authMiddleware }, routes.removeAgentFromProjectRouteV2);
  fastify.get('/api/projects/:id/agents', { preHandler: authMiddleware }, routes.getProjectAgentsRoute);
  fastify.patch('/api/projects/:id/agents/:agentId', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['lead', 'contributor', 'observer'] }
        }
      }
    }
  }, routes.updateAgentProjectRoleRoute);

  // ============================================================================
  // R&D ROUTES
  // ============================================================================
  fastify.get('/api/rnd/status', { preHandler: authMiddleware }, routes.getRndStatusRoute);
  fastify.get('/api/rnd/feed', { preHandler: authMiddleware }, routes.getRndFeedRoute);
  fastify.post('/api/rnd/:id/execute', { preHandler: authMiddleware }, routes.executeRndRoute);
  fastify.patch('/api/rnd/:id/schedule', { preHandler: [authMiddleware, validate(updateRndScheduleSchema)] }, routes.updateRndScheduleRoute);
  fastify.get('/api/rnd/:id/findings', { preHandler: authMiddleware }, routes.getRndFindingsRoute);

  // ============================================================================
  // ORCHESTRATION ENGINE ROUTES
  // ============================================================================
  fastify.post('/api/orchestration/sweep', { preHandler: authMiddleware }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      reply.code(403);
      return { error: 'Admin only' };
    }
    const { runAutoAssignmentSweep } = require('./orchestration-engine');
    const result = runAutoAssignmentSweep();
    return result;
  });

  // ============================================================================
  // PRESET ROUTES
  // ============================================================================
  fastify.get('/api/presets', routes.listPresetsRoute);
  fastify.get('/api/presets/:type', routes.listPresetsByTypeRoute);
  fastify.get('/api/presets/:type/:name', routes.getPresetRoute);
  fastify.post('/api/presets/sync', { preHandler: authMiddleware }, routes.syncPresetsRoute);

  // ============================================================================
  // WEBSOCKET ENDPOINT
  // ============================================================================
  fastify.get('/ws', { websocket: true }, async (connection, req) => {
    const socket = connection.socket;

    // Parse query params
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const projects = url.searchParams.get('projects');
    const channels = url.searchParams.get('channels');
    const token = url.searchParams.get('token');

    const projectIds = projects ? projects.split(',') : [];
    const channelList = channels ? channels.split(',') : [];

    // Authenticate synchronously before registering
    let userId = null;
    if (token) {
      try {
        const { getUserByToken } = require('./auth');
        const wsUser = await getUserByToken(token);
        if (wsUser) userId = wsUser.id;
      } catch (e) { /* non-critical: unauthenticated WS connection */ }
    }

    // Register client — userId is now guaranteed to be set
    wsManager.register(socket, {
      userId,
      channels: channelList,
      projectIds
    });

    // Server-side keepalive ping every 30s
    const heartbeat = setInterval(() => {
      if (socket.readyState === 1) socket.ping();
    }, 30000);

    // Send welcome message
    setTimeout(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({
          event: 'connected',
          data: {
            message: 'WebSocket connected to PROJECT-CLAW API',
            serverTime: new Date().toISOString(),
            user_id: userId
          }
        }));
      }
    }, 0);

    // Handle messages
    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.action) {
          case 'subscribe_project':
            if (data.project_id) {
              wsManager.subscribeToProject(socket, data.project_id);
              socket.send(JSON.stringify({
                event: 'subscribed',
                data: { type: 'project', project_id: data.project_id }
              }));
            }
            break;

          case 'unsubscribe_project':
            if (data.project_id) {
              wsManager.unsubscribeFromProject(socket, data.project_id);
              socket.send(JSON.stringify({
                event: 'unsubscribed',
                data: { type: 'project', project_id: data.project_id }
              }));
            }
            break;

          case 'subscribe_channel':
            const subscribeChannelId = data.channel_id || data.channel;
            if (subscribeChannelId) {
              wsManager.subscribeToChannel(socket, subscribeChannelId);
              socket.send(JSON.stringify({
                event: 'subscribed',
                data: { type: 'channel', channel: subscribeChannelId }
              }));
            }
            break;

          case 'unsubscribe_channel':
            const unsubscribeChannelId = data.channel_id || data.channel;
            if (unsubscribeChannelId) {
              wsManager.unsubscribeFromChannel(socket, unsubscribeChannelId);
              socket.send(JSON.stringify({
                event: 'unsubscribed',
                data: { type: 'channel', channel: unsubscribeChannelId }
              }));
            }
            break;

          case 'typing':
            const typingChannelId = data.channel_id || data.channel;
            if (typingChannelId && userId) {
              wsManager.emitTyping(userId, typingChannelId, data.is_typing);
            }
            break;

          case 'typing_start':
            const typingStartChannelId = data.channel_id || data.channel;
            if (typingStartChannelId && userId) {
              const { setTypingIndicator } = require('./chat');
              await setTypingIndicator(userId, typingStartChannelId, true);
            }
            break;

          case 'typing_stop':
            const typingStopChannelId = data.channel_id || data.channel;
            if (typingStopChannelId && userId) {
              const { setTypingIndicator } = require('./chat');
              await setTypingIndicator(userId, typingStopChannelId, false);
            }
            break;

          case 'channel_join':
            if (data.channel_id && userId) {
              const db = getDb();
              db.addChannelMember(data.channel_id, { userId });
              db.updateLastRead(data.channel_id, userId);
              socket.send(JSON.stringify({
                event: 'channel_joined',
                data: { channel_id: data.channel_id }
              }));
            }
            break;

          case 'ping':
            socket.send(JSON.stringify({
              event: 'pong',
              data: { timestamp: new Date().toISOString() }
            }));
            break;

          case 'chat_message':
            // Handle incoming chat message via WebSocket
            if (data.content && userId) {
              try {
                const { sendChannelMessage } = require('./chat');
                // Use new channel-based message function with channel_id
                const message = await sendChannelMessage(userId, data.channel_id || data.channel || 'general', data.content, {
                  metadata: data.metadata || {}
                });

                // Sender already gets chat:message via emitChannelMessage broadcast
                // Just confirm delivery
                socket.send(JSON.stringify({
                  event: 'message:sent',
                  data: { id: message.id, channel_id: message.channel_id }
                }));

                // Note: emitChannelMessage is already called inside sendChannelMessage
              } catch (err) {
                fastify.log.error('WebSocket chat_message error:', err);
                socket.send(JSON.stringify({
                  event: 'error',
                  data: { message: 'Failed to send message', error: err.message }
                }));
              }
            }
            break;
        }
      } catch (err) {
        fastify.log.error('WebSocket message error:', err);
      }
    });

    // Handle disconnect
    socket.on('close', () => {
      clearInterval(heartbeat);
      wsManager.unregister(socket);
    });

    // Handle errors
    socket.on('error', (err) => {
      fastify.log.error('WebSocket error:', err);
      wsManager.unregister(socket);
    });
  });

  return fastify;
}

// Start server
async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });

    // ── Agent offline detection cron ──────────────────────────────────────────
    // Every 60s: mark agents offline if no heartbeat in 90s
    setInterval(() => {
      try {
        const db = getDb();
        const staleThreshold = new Date(Date.now() - 90 * 1000).toISOString();
        const staleAgents = db.prepare(`
          SELECT id, name FROM manager_agents
          WHERE status = 'online'
            AND is_approved = 1
            AND (last_heartbeat IS NULL OR last_heartbeat < ?)
        `).all(staleThreshold);

        for (const agent of staleAgents) {
          db.prepare(`UPDATE manager_agents SET status = 'offline', updated_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), agent.id);
          wsManager.broadcast('agent:status_changed', { agent_id: agent.id, agent_name: agent.name, status: 'offline' });
          console.log(`[Heartbeat] Agent ${agent.name} marked offline (no heartbeat)`);
        }
      } catch (e) {
        console.error('[Heartbeat cron error]', e.message);
      }
    }, 60 * 1000);
    // ──────────────────────────────────────────────────────────────────────────

    // ── R&D autonomous agent scheduler ────────────────────────────────────────
    const { startRndScheduler } = require('./rnd-scheduler');
    startRndScheduler(wsManager);

    // ── Redis pub/sub for cross-instance WS broadcasting ─────────────────────
    await initSubscriber(({ event, data, filters }) => {
      wsManager.broadcast(event, data, filters || {});
    });
    // ──────────────────────────────────────────────────────────────────────────

    console.log(`🚀 PROJECT-CLAW API Server v1.2.0 running at http://${HOST}:${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
    console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
    console.log('');
    console.log('📊 API Endpoints:');
    console.log('  PROJECTS:');
    console.log('    GET    /api/projects              - List all projects');
    console.log('    POST   /api/projects              - Create new project');
    console.log('    GET    /api/projects/:id          - Get project details');
    console.log('    GET    /api/projects/:id/tasks    - Get project tasks');
    console.log('    PATCH  /api/projects/:id/status   - Update project status');
    console.log('');
    console.log('  TASKS:');
    console.log('    POST   /api/tasks                 - Create new task');
    console.log('');
    console.log('  COSTS:');
    console.log('    GET    /api/costs/summary         - Legacy cost summary');
    console.log('    POST   /api/costs                 - Record cost (legacy)');
    console.log('    GET    /api/costs/actual          - Real costs from OpenRouter');
    console.log('    POST   /api/costs/sync            - Trigger OpenRouter sync');
    console.log('    GET    /api/costs/budget          - Budget vs actual');
    console.log('    GET    /api/costs/models          - Per-model breakdown');
    console.log('    GET    /api/costs/credits         - OpenRouter credits');
    console.log('');
    console.log('  TOKEN DASHBOARD:');
    console.log('    GET    /api/tokens/dashboard      - Full token dashboard (NEW spec)');
    console.log('    GET    /api/tokens/providers/:p   - Provider details (kimi/openai/claude)');
    console.log('    GET    /api/tokens/usage          - Daily usage for charts');
    console.log('    GET    /api/tokens/models         - Per-model breakdown');
    console.log('    GET    /api/tokens/context        - Context token stats');
    console.log('    GET    /api/tokens/status         - Provider API status');
    console.log('    POST   /api/tokens/record         - Record token usage');
    console.log('');
    console.log('  CHAT:');
    console.log('    POST   /api/messages              - Send message');
    console.log('    GET    /api/messages/:channel     - Get channel messages');
    console.log('    PATCH  /api/messages/:id          - Edit message');
    console.log('    DELETE /api/messages/:id          - Delete message');
    console.log('    GET    /api/dm                    - Get user DM channels');
    console.log('    GET    /api/dm/:agent_id          - Get DM history');
    console.log('    POST   /api/dm/:agent_id          - Send DM to agent');
    console.log('');
    console.log('  AUTH:');
    console.log('    POST   /api/auth/telegram         - Authenticate via Telegram');
    console.log('    POST   /api/auth/login            - Login with email/password');
    console.log('    POST   /api/auth/register         - Register new user');
    console.log('    POST   /api/auth/logout           - Logout');
    console.log('    GET    /api/auth/me               - Get current user');
    console.log('');
    console.log('  MANAGER AGENTS:');
    console.log('    GET    /api/agents                    - List agents (admin)');
    console.log('    GET    /api/agents/:id                - Get agent profile');
    console.log('    POST   /api/agents/register           - Register agent (pending)');
    console.log('    POST   /api/agents/:id/approve        - Approve agent (admin)');
    console.log('    POST   /api/agents/:id/status         - Update agent status');
    console.log('    GET    /api/agents/:id/notifications  - Get agent notifications');
    console.log('    POST   /api/agents/:id/notifications/:nid/read - Mark notification read');
    console.log('    POST   /api/agents/:id/projects/:pid  - Assign to project (admin)');
    console.log('    DELETE /api/agents/:id/projects/:pid  - Remove from project (admin)');
    console.log('');
    console.log('  BUDGETS:');
    console.log('    GET    /api/budgets               - List budgets');
    console.log('    POST   /api/budgets               - Create budget');
    console.log('');
    console.log('  MACHINES:');
    console.log('    GET    /api/machines              - List machines');
    console.log('    POST   /api/machines/register     - Register machine');
    console.log('');
    console.log('🔒 Environment: ${NODE_ENV}');
    console.log('🌐 CORS Origins: ${config.CORS_ORIGINS.join(\', \')}');
    console.log('⏱️  Rate Limit: ${config.RATE_LIMIT_MAX} requests per ${config.RATE_LIMIT_WINDOW}');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️  Forcing shutdown...');
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`\n👋 Received ${signal}. Shutting down gracefully...`);

  const forceShutdownTimeout = setTimeout(() => {
    console.error('⚠️  Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);

  try {
    await fastify.close();
    console.log('✅ HTTP server closed');

    await closeRedis();
    console.log('✅ Redis connections closed');

    await flushSentry();

    const db = getDb();
    db.close();
    console.log('✅ Database connection closed');

    clearTimeout(forceShutdownTimeout);
    console.log('👋 Goodbye!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ============================================================================
start();

module.exports = { buildServer };