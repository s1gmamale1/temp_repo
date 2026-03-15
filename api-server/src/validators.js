const { z } = require('zod');

// ============================================================================
// VALIDATION MIDDLEWARE
// ============================================================================

/**
 * Creates a Fastify preHandler that validates request.body against a Zod schema.
 * Returns 400 with detailed errors on failure.
 */
function validate(schema) {
  return async function (request, reply) {
    if (!request.body) request.body = {};
    const result = schema.safeParse(request.body);
    if (!result.success) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      });
      return;
    }
    // Replace body with parsed (cleaned/coerced) data
    request.body = result.data;
  };
}

/**
 * Validates request.params against a Zod schema.
 */
function validateParams(schema) {
  return async function (request, reply) {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid URL parameters',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      });
      return;
    }
    request.params = result.data;
  };
}

/**
 * Validates request.query against a Zod schema.
 */
function validateQuery(schema) {
  return async function (request, reply) {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      });
      return;
    }
    request.query = result.data;
  };
}

// ============================================================================
// COMMON TYPES
// ============================================================================

const uuid = z.string().min(1).max(255);
const nonEmptyString = z.string().min(1).max(10000);
const optionalString = z.string().max(10000).optional();

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255),
  description: z.string().max(5000).optional().default(''),
  config: z.object({}).passthrough().optional(),
  type: z.string().max(50).optional(),
  status: z.enum(['active', 'standby', 'completed', 'cancelled']).optional().default('active'),
});

const updateProjectStatusSchema = z.object({
  status: z.enum(['active', 'standby', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Status must be one of: active, standby, completed, cancelled' })
  }),
});

// ============================================================================
// TASK SCHEMAS
// ============================================================================

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  due_date: z.string().optional().nullable(),
  estimated_hours: z.number().int().min(0).optional().nullable(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  payload: z.object({}).passthrough().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

// ============================================================================
// COST SCHEMAS
// ============================================================================

const recordCostSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  model: z.string().min(1, 'model is required').max(100),
  prompt_tokens: z.number().int().min(0).optional().default(0),
  completion_tokens: z.number().int().min(0).optional().default(0),
  cost_usd: z.number().min(0).optional().default(0),
  agent_id: optionalString,
  task_id: optionalString,
  metadata: z.object({}).passthrough().optional(),
});

// ============================================================================
// BUDGET SCHEMAS
// ============================================================================

const createBudgetSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  name: z.string().min(1, 'Budget name is required').max(255),
  budget_amount: z.number().positive('Budget amount must be positive'),
  budget_period: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  alert_threshold: z.number().min(0).max(1).optional().default(0.8),
});

// ============================================================================
// MACHINE SCHEMAS
// ============================================================================

const registerMachineSchema = z.object({
  hostname: z.string().min(1, 'hostname is required').max(255),
  ip_address: z.string().max(45).optional(),
  ipAddress: z.string().max(45).optional(),
  mac_address: z.string().max(17).optional(),
  metadata: z.object({}).passthrough().optional(),
  agent_id: optionalString,
}).transform(data => {
  // Normalize ip_address field
  if (data.ipAddress && !data.ip_address) {
    data.ip_address = data.ipAddress;
  }
  return data;
});

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

const registerUserSchema = z.object({
  login: z.string().min(1, 'Login is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email('Invalid email format').max(255).optional(),
  role: z.enum(['user', 'admin', 'readonly']).optional().default('user'),
});

// ============================================================================
// AGENT SCHEMAS
// ============================================================================

const registerAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  handle: z.string().min(2, 'Handle must be at least 2 characters').max(50)
    .regex(/^@?[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email().max(255).optional().nullable(),
  role: z.string().max(50).optional().default('developer'),
  skills: z.array(z.string().max(100)).max(50).optional().default([]),
  specialties: z.array(z.string().max(100)).max(50).optional().default([]),
  experience_level: z.enum(['junior', 'mid', 'senior', 'expert']).optional().default('expert'),
  agent_type: z.enum(['pm', 'worker', 'rnd']).optional().default('worker'),
  current_mode: z.string().max(100).optional().nullable(),
  current_model: z.string().max(100).optional().nullable(),
  rnd_division: z.string().max(100).optional().nullable(),
});

const updateAgentSchema = z.object({
  agent_type: z.enum(['pm', 'worker', 'rnd']).optional(),
  current_mode: z.string().max(100).optional().nullable(),
  current_model: z.string().max(100).optional().nullable(),
  rnd_division: z.string().max(100).optional().nullable(),
  rnd_schedule: z.string().max(100).optional().nullable(),
  status: z.enum(['online', 'offline', 'working', 'idle']).optional(),
  last_heartbeat: z.string().optional(),
  project_id: z.string().optional().nullable(),
  name: z.string().min(2).max(100).optional(),
  role: z.string().max(50).optional(),
  skills: z.array(z.string().max(100)).max(50).optional(),
  specialties: z.array(z.string().max(100)).max(50).optional(),
  experience_level: z.enum(['junior', 'mid', 'senior', 'expert']).optional(),
});

const updateAgentStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'working', 'idle'], {
    errorMap: () => ({ message: 'Status must be one of: online, offline, working, idle' })
  }),
});

// ============================================================================
// MESSAGE SCHEMAS
// ============================================================================

const editMessageSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty').max(10000),
});

// ============================================================================
// TOKEN SCHEMAS
// ============================================================================

const recordTokenUsageSchema = z.object({
  provider: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  prompt_tokens: z.number().int().min(0).optional().default(0),
  completion_tokens: z.number().int().min(0).optional().default(0),
  cost_usd: z.number().min(0).optional().default(0),
  project_id: optionalString,
  agent_id: optionalString,
  task_id: optionalString,
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  validate,
  validateParams,
  validateQuery,

  // Schemas
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
};
