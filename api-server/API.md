# PROJECT-CLAW API Documentation v1.2.0

Comprehensive API for project management, cost tracking, real-time chat, and agent management.

## Base URL

```
Development: http://localhost:3001
Production:  https://your-domain.com
```

## WebSocket

```
ws://localhost:3001/ws
```

## Authentication

The API uses Bearer token authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

### Telegram Authentication

```http
POST /api/auth/telegram
Content-Type: application/json

{
  "telegram_data": {
    "id": 123456789,
    "first_name": "Leonardo",
    "username": "leo_tmnt"
  }
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "name": "Leonardo",
    "telegram_id": "123456789",
    "role": "user",
    "avatar_url": "..."
  },
  "session": {
    "token": "sess_...",
    "expires_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## Projects

### List Projects
```http
GET /api/projects?status=active&limit=20&offset=0
```

### Get Project
```http
GET /api/projects/:id
```

### Create Project
```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Project",
  "description": "Project description",
  "config": {}
}
```

### Update Project Status
```http
PATCH /api/projects/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "active"  // active, paused, completed, archived
}
```

### Get Project Tasks
```http
GET /api/projects/:id/tasks?status=pending&limit=50
```

---

## Tasks

### Create Task
```http
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "uuid",
  "title": "Task title",
  "description": "Task description",
  "priority": 3,
  "payload": {}
}
```

---

## Cost Tracking (Real)

### Get Actual Costs
```http
GET /api/costs/actual
Authorization: Bearer <token>

Query Parameters:
  - project_id: Filter by project
  - user_id: Filter by user
  - model: Filter by model
  - from: Start date (ISO 8601)
  - to: End date (ISO 8601)
  - group_by: day, week, month, hour
  - limit: Number of records (default: 100)
  - offset: Pagination offset
```

**Response:**
```json
{
  "records": [
    {
      "period": "2024-01-15",
      "request_count": 42,
      "total_prompt_tokens": 50000,
      "total_completion_tokens": 20000,
      "total_tokens": 70000,
      "total_cost_usd": 0.234,
      "models_used": ["moonshot/kimi-k2.5", "openai/gpt-4o"]
    }
  ],
  "grand_total": {
    "requests": 150,
    "tokens": 250000,
    "cost_usd": 0.85
  },
  "model_breakdown": [
    {
      "model": "moonshot/kimi-k2.5",
      "request_count": 100,
      "prompt_tokens": 80000,
      "completion_tokens": 30000,
      "total_tokens": 110000,
      "cost_usd": 0.55
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "has_more": false
  }
}
```

### Sync OpenRouter Data
```http
POST /api/costs/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "days": 30,
  "project_id": "uuid"  // optional
}
```

### Get Budget vs Actual
```http
GET /api/costs/budget?project_id=uuid&period=monthly
```

**Response:**
```json
{
  "comparisons": [
    {
      "budget_id": "uuid",
      "project_id": "uuid",
      "name": "Monthly API Budget",
      "budget_period": "monthly",
      "budget_amount": 500.00,
      "actual_spend": 342.50,
      "remaining": 157.50,
      "percentage_used": 68.50,
      "alert_threshold": 0.8,
      "alert_triggered": false,
      "period_start": "2024-01-01T00:00:00Z",
      "period_end": "2024-01-31T23:59:59Z"
    }
  ],
  "summary": {
    "total_budgets": 2,
    "total_budget_amount": 1500.00,
    "total_actual_spend": 892.30,
    "alerts_triggered": 0
  }
}
```

### Get Model Costs
```http
GET /api/costs/models?from=2024-01-01&to=2024-01-31
```

**Response:**
```json
{
  "models": [
    {
      "model": "moonshot/kimi-k2.5",
      "total_requests": 150,
      "total_prompt_tokens": 100000,
      "total_completion_tokens": 50000,
      "total_tokens": 150000,
      "total_cost_usd": 0.75,
      "avg_cost_per_request": 0.005,
      "first_used": "2024-01-01T10:00:00Z",
      "last_used": "2024-01-15T14:30:00Z",
      "cost_percentage": 60.0
    }
  ],
  "daily_breakdown": [
    {
      "model": "moonshot/kimi-k2.5",
      "date": "2024-01-15",
      "requests": 10,
      "tokens": 5000,
      "cost_usd": 0.025
    }
  ],
  "summary": {
    "total_models": 3,
    "total_requests": 300,
    "total_cost": 1.25
  }
}
```

### Get OpenRouter Credits
```http
GET /api/costs/credits
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_credits": 100.00,
  "total_usage": 45.50,
  "remaining": 54.50
}
```

---

## Chat

### Send Message
```http
POST /api/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello @Donatello, can you help me?",
  "channel": "general",
  "agent_id": "uuid",        // optional - for DM
  "is_dm": false,            // true for direct message
  "metadata": {}             // optional
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "agent_id": null,
  "content": "Hello @Donatello, can you help me?",
  "channel": "general",
  "message_type": "text",
  "is_dm": false,
  "created_at": "2024-01-15T10:30:00Z"
}
```

> Note: If the message contains `@agentname` or is sent in a DM, an agent will automatically respond via WebSocket.

### Get Channel Messages
```http
GET /api/messages/:channel?limit=50&before=iso_timestamp&after=iso_timestamp
```

**Response:**
```json
{
  "channel": "general",
  "messages": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user_name": "Leonardo",
      "user_avatar": "/avatars/leo.png",
      "agent_id": null,
      "content": "Hello team!",
      "channel": "general",
      "message_type": "text",
      "metadata": {},
      "is_dm": false,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 1
}
```

### Edit Message
```http
PATCH /api/messages/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated message content"
}
```

### Delete Message
```http
DELETE /api/messages/:id
Authorization: Bearer <token>
```

### Get DM Channels
```http
GET /api/dm
Authorization: Bearer <token>
```

**Response:**
```json
{
  "channels": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "agent_id": "uuid",
      "agent_name": "Donatello",
      "agent_avatar": "/agents/donnie.png",
      "agent_role": "Tech Lead",
      "last_message": "According to my calculations...",
      "last_message_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

### Get DM History
```http
GET /api/dm/:agent_id?limit=50&before=iso_timestamp
```

**Response:**
```json
{
  "channel_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user_name": "Leonardo",
      "agent_id": "uuid",
      "agent_name": "Donatello",
      "content": "Hey, need help with the API!",
      "message_type": "text",
      "is_dm": true,
      "dm_channel_id": "uuid",
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "uuid",
      "agent_id": "uuid",
      "agent_name": "Donatello",
      "content": "I've got you covered! What do you need?",
      "message_type": "agent_response",
      "is_dm": true,
      "created_at": "2024-01-15T10:01:00Z"
    }
  ]
}
```

### Send DM
```http
POST /api/dm/:agent_id
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hey Donnie, what's the status on the API?",
  "metadata": {}
}
```

---

## Agents

### List Agents
```http
GET /api/agents?project_id=uuid&is_active=true
```

**Response:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "name": "Donatello",
      "role": "Tech Lead",
      "description": "Technical genius...",
      "avatar_url": "/agents/donnie.png",
      "status": "idle",
      "is_active": true,
      "personality": {
        "traits": ["analytical", "innovative"],
        "catchphrase": "According to my calculations..."
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

### Get Agent
```http
GET /api/agents/:id
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Donatello",
  "role": "Tech Lead",
  "description": "Technical genius...",
  "status": "idle",
  "personality": { ... },
  "recent_messages": [
    {
      "id": "uuid",
      "content": "I've analyzed the situation...",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

## Budgets

### List Budgets
```http
GET /api/budgets?project_id=uuid
```

### Create Budget
```http
POST /api/budgets
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": "uuid",
  "name": "Q1 API Budget",
  "budget_amount": 1000.00,
  "budget_period": "monthly",  // daily, weekly, monthly, yearly
  "alert_threshold": 0.8       // Alert at 80% usage
}
```

---

## WebSocket Events

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token=sess_...&channels=general,dev');
```

### Client → Server Actions

```javascript
// Subscribe to project
ws.send(JSON.stringify({
  action: 'subscribe_project',
  project_id: 'uuid'
}));

// Subscribe to channel
ws.send(JSON.stringify({
  action: 'subscribe_channel',
  channel: 'general'
}));

// Typing indicator
ws.send(JSON.stringify({
  action: 'typing',
  channel: 'general',
  is_typing: true
}));

// Ping
ws.send(JSON.stringify({ action: 'ping' }));
```

### Server → Client Events

```javascript
// Connected
{
  "event": "connected",
  "data": {
    "message": "WebSocket connected to PROJECT-CLAW API",
    "serverTime": "2024-01-15T10:00:00Z",
    "user_id": "uuid"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// New message
{
  "event": "message:new",
  "data": {
    "message_id": "uuid",
    "user_id": "uuid",
    "agent_id": null,
    "content": "Hello!",
    "channel": "general",
    "message_type": "text",
    "is_dm": false,
    "created_at": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// Agent response
{
  "event": "message:agent_response",
  "data": {
    "message_id": "uuid",
    "parent_message_id": "uuid",
    "agent_id": "uuid",
    "content": "According to my calculations...",
    "channel": "general",
    "is_dm": false,
    "metadata": { "agent_name": "Donatello" },
    "created_at": "2024-01-15T10:01:00Z"
  },
  "timestamp": "2024-01-15T10:01:00Z"
}

// Project status changed
{
  "event": "project:status_changed",
  "data": {
    "project_id": "uuid",
    "old_status": "active",
    "new_status": "completed",
    "changed_at": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// Task created
{
  "event": "task:created",
  "data": {
    "task_id": "uuid",
    "project_id": "uuid",
    "title": "New task",
    "status": "pending",
    "priority": 3,
    "created_at": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// Cost updated
{
  "event": "cost:updated",
  "data": {
    "project_id": "uuid",
    "cost_id": "uuid",
    "model": "moonshot/kimi-k2.5",
    "prompt_tokens": 1000,
    "completion_tokens": 500,
    "total_tokens": 1500,
    "cost_usd": 0.015,
    "updated_at": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// User typing
{
  "event": "user:typing",
  "data": {
    "user_id": "uuid",
    "channel": "general",
    "is_typing": true,
    "timestamp": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}

// Pong (response to ping)
{
  "event": "pong",
  "data": {
    "timestamp": "2024-01-15T10:00:00Z"
  },
  "timestamp": "2024-01-15T10:00:00Z"
}
```

---

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | User display name |
| telegram_id | VARCHAR | Telegram user ID |
| email | VARCHAR | Email address |
| role | ENUM | user, admin, agent |
| avatar_url | TEXT | Profile image URL |
| created_at | TIMESTAMP | Creation time |

### messages
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Sender (null for agents) |
| agent_id | UUID | Agent sender (null for users) |
| content | TEXT | Message content |
| channel | VARCHAR | Channel name |
| message_type | ENUM | text, image, file, system, agent_response |
| is_dm | BOOLEAN | Direct message flag |
| dm_channel_id | UUID | DM channel reference |
| parent_message_id | UUID | Reply reference |
| created_at | TIMESTAMP | Creation time |

### dm_channels
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User in DM |
| agent_id | UUID | Agent in DM |
| created_at | TIMESTAMP | Creation time |

### cost_records
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Associated project |
| user_id | UUID | User who triggered cost |
| model | VARCHAR | AI model used |
| prompt_tokens | INTEGER | Input tokens |
| completion_tokens | INTEGER | Output tokens |
| cost_usd | DECIMAL | Cost in USD |
| recorded_at | TIMESTAMP | When recorded |

### budgets
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Associated project |
| name | VARCHAR | Budget name |
| budget_amount | DECIMAL | Budget limit |
| budget_period | ENUM | daily, weekly, monthly, yearly |
| alert_threshold | DECIMAL | Alert trigger % |

---

## Environment Variables

```bash
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Database
DB_TYPE=sqlite  # or postgresql
DB_PATH=./data/project-claw.db
DATABASE_URL=postgresql://user:pass@localhost/dbname

# Security
JWT_SECRET=your-secret-key

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_REFERER=https://your-domain.com

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
```

---

## Error Responses

```json
// 400 Bad Request
{
  "error": "Invalid request",
  "message": "Content is required"
}

// 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}

// 403 Forbidden
{
  "error": "Forbidden",
  "message": "Not authorized to perform this action"
}

// 404 Not Found
{
  "error": "Not found",
  "message": "Project not found"
}

// 429 Too Many Requests
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 30 seconds",
  "retryAfter": 30
}

// 500 Internal Server Error
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Seed the database with demo data
npm run seed

# Or use the new seed script
node seed-new.js

# Start development server
npm run dev

# The server will start on http://localhost:3001
```
