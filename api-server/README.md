# PROJECT-CLAW API Server

Fastify + SQLite backend for the PROJECT-CLAW dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# (Optional) Switch AI provider profile before starting:
npm run env:local   # local Ollama only (no cloud key needed)
npm run env:hybrid  # Ollama with OpenRouter fallback

# Start development server (with auto-reload)
npm run dev

# Or start production server
npm start
```

## API Endpoints

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects (paginated) |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/:id` | Get project details |
| GET | `/api/projects/:id/tasks` | Get tasks for a project |
| PATCH | `/api/projects/:id/status` | Update project status |

**Query Parameters for `/api/projects`:**
- `status` - Filter by status (active, paused, completed, archived)
- `limit` - Results per page (default: 20, max: 100)
- `offset` - Pagination offset (default: 0)

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create a new task |

### Costs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/costs/summary` | Cost analytics by project/date |
| POST | `/api/costs` | Record a cost (for testing) |

**Query Parameters for `/api/costs/summary`:**
- `project_id` - Filter by project
- `from` - Start date (ISO 8601)
- `to` - End date (ISO 8601)
- `group_by` - Aggregation: `day`, `week`, or `month` (default: day)

## WebSocket Events

Connect to: `ws://localhost:3001/ws`

Subscribe to specific projects: `ws://localhost:3001/ws?projects=uuid1,uuid2`

### Real-time Events

| Event | Description | Payload |
|-------|-------------|---------|
| `project:status_changed` | Project status updated | `{ project_id, old_status, new_status, changed_at }` |
| `task:created` | New task created | `{ task_id, project_id, title, status, priority, created_at }` |
| `cost:updated` | New cost recorded | `{ project_id, model, tokens, cost_usd, updated_at }` |

### WebSocket Client Actions

Send JSON messages to manage subscriptions:

```json
// Subscribe to a project
{ "action": "subscribe", "project_id": "uuid" }

// Unsubscribe from a project
{ "action": "unsubscribe", "project_id": "uuid" }
```

## Database

SQLite database stored at `data/project-claw.db`.

Tables:
- `projects` - Project definitions
- `agents` - Agent instances per project
- `tasks` - Tasks assigned to agents
- `costs` - API usage costs

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | HTTP server port |
| `HOST` | 0.0.0.0 | Server bind address |
| `DB_PATH` | `./data/project-claw.db` | SQLite database file path |

## Example Usage

```bash
# List projects
curl http://localhost:3001/api/projects

# Get project details
curl http://localhost:3001/api/projects/{id}

# Get project tasks
curl http://localhost:3001/api/projects/{id}/tasks

# Get cost summary
curl http://localhost:3001/api/costs/summary

# Get costs for specific project, grouped by week
curl "http://localhost:3001/api/costs/summary?project_id={id}&group_by=week"

# Create a task
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"project_id": "{id}", "title": "New Task", "priority": 3}'

# Update project status (triggers WebSocket event)
curl -X PATCH http://localhost:3001/api/projects/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```

## WebSocket Test (wscat)

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:3001/ws

# Subscribe to a project
> {"action":"subscribe","project_id":"your-project-uuid"}

# Watch for events!
```

## Architecture

```
api-server/
├── src/
│   ├── server.js      # Fastify server + WebSocket setup
│   ├── database.js    # SQLite connection & schema
│   ├── routes.js      # API route handlers
│   ├── websocket.js   # WebSocket event manager
│   └── seed.js        # Mock data generator
├── data/
│   └── project-claw.db # SQLite database
└── package.json
```

---

Built by Donatello (TMNT Tech) for PROJECT-CLAW 🐢⚡
