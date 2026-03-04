# PROJECT-CLAW API - Quick Reference

## ✅ Deliverables Complete

### REST API Endpoints

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/projects` | GET | ✅ Lists all projects with pagination |
| `/api/projects/:id` | GET | ✅ Returns project details + agent/task counts |
| `/api/projects/:id/tasks` | GET | ✅ Returns tasks for a project |
| `/api/costs/summary` | GET | ✅ Cost analytics with aggregation |

### WebSocket Events

| Event | Status |
|-------|--------|
| `project:status_changed` | ✅ Triggered on status update |
| `task:created` | ✅ Triggered when task created |
| `cost:updated` | ✅ Triggered when cost recorded |

### Tech Stack

- **Runtime:** Node.js 22+
- **Framework:** Fastify 4.x
- **Database:** SQLite (better-sqlite3)
- **WebSocket:** @fastify/websocket
- **CORS:** Enabled for all origins

## File Structure

```
api-server/
├── src/
│   ├── server.js       # Main Fastify server
│   ├── database.js     # SQLite schema & connection
│   ├── routes.js       # API route handlers
│   ├── websocket.js    # WS event manager
│   └── seed.js         # Mock data generator
├── data/
│   └── project-claw.db # SQLite database
├── package.json
└── README.md
```

## Run Instructions

```bash
cd api-server

# Install dependencies (already done)
npm install

# Seed mock data
npm run seed

# Start dev server with auto-reload
npm run dev

# Server runs on http://localhost:3001
# WebSocket: ws://localhost:3001/ws
```

## Test Examples

```bash
# List projects
curl http://localhost:3001/api/projects

# Get project details
curl http://localhost:3001/api/projects/{id}

# Get project tasks  
curl http://localhost:3001/api/projects/{id}/tasks

# Get cost summary
curl http://localhost:3001/api/costs/summary

# Create task (triggers WS event)
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"project_id": "{id}", "title": "New Task"}'

# Update project status (triggers WS event)
curl -X PATCH http://localhost:3001/api/projects/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Record cost (triggers WS event)
curl -X POST http://localhost:3001/api/costs \
  -H "Content-Type: application/json" \
  -d '{"project_id": "{id}", "model": "gpt-4", "cost_usd": 0.045}'
```

## WebSocket Client Example

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?projects=uuid1,uuid2');

ws.onmessage = (event) => {
  const { event: type, data } = JSON.parse(event.data);
  console.log('Received:', type, data);
  // Handle: project:status_changed, task:created, cost:updated
};

// Subscribe to additional projects
ws.send(JSON.stringify({ action: 'subscribe', project_id: 'uuid3' }));
```

## Mock Data Seeded

- 4 Projects (AI Agent Swarm, Project Claw Dashboard, Data Pipeline, Model Fine-tuning)
- 9 Agents (distributed across projects)
- 34 Tasks (various statuses)
- 8 Cost records (~$0.24 total)

---
Built by Donatello (TMNT Tech) 🐢⚡
