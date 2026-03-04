# Sanity Check Report - Leonardo (TMNT Leader)
**Date:** 2026-02-28  
**Status:** 🔴 CRITICAL ISSUES FOUND

---

## Executive Summary

After systematic testing of the entire stack, I found **4 major integration issues** between the frontend and backend. The backend APIs are working correctly, but the frontend is calling **wrong endpoints** and there is **duplicate data** from multiple seed runs.

---

## Test Results

### ✅ Backend API Tests (All Passing)

| Test | Endpoint | Result |
|------|----------|--------|
| Health Check | `GET /health` | ✅ Returns `{"status":"ok",...}` |
| Login | `POST /api/auth/login` | ✅ Returns user + session token |
| List Agents | `GET /api/agents` | ✅ Returns 12 agents |
| List Projects | `GET /api/projects` | ✅ Returns 6 projects |
| Live Costs | `GET /api/costs/live` | ✅ Returns real cost data ($0.36 spent) |
| Get DM Channels | `GET /api/dm` | ✅ Returns 1 DM channel |
| Get Messages | `GET /api/messages/general` | ✅ Returns 7 messages |
| Send Message | `POST /api/messages` | ✅ Message created successfully |

### ❌ Frontend API Mismatches

| Feature | Frontend Calls | Backend Has | Status |
|---------|---------------|-------------|--------|
| **Chat Messages** | `GET /api/chat/channels/${id}/messages` | `GET /api/messages/:channel` | ❌ **BROKEN** |
| **Send Message** | `POST /api/chat/channels/${id}/messages` | `POST /api/messages` | ❌ **BROKEN** |
| **Cost Summary** | `GET /api/costs/summary` | `GET /api/costs/live` | ❌ **WRONG ENDPOINT** |
| **List Channels** | `GET /api/chat/channels` | ❌ **NOT IMPLEMENTED** | ❌ **BROKEN** |
| **List Chat Agents** | `GET /api/chat/agents` | ❌ **NOT IMPLEMENTED** | ❌ **BROKEN** |

---

## Issue 1: Chat Messages Not Sending

**Root Cause:** Frontend is calling non-existent endpoints

The frontend `Chat.tsx` uses `chatApi` methods that call:
- `GET /api/chat/channels/${channelId}/messages` ❌
- `POST /api/chat/channels/${channelId}/messages` ❌

But the backend provides:
- `GET /api/messages/:channel` ✅
- `POST /api/messages` ✅

**Evidence:**
```javascript
// web-hq/src/services/api.ts (WRONG)
getMessages: (channelId: string) => 
  fetchApi(`/api/chat/channels/${channelId}/messages`),

// api-server/src/routes.js (CORRECT)
fastify.get('/api/messages/:channel', getChannelMessagesRoute);
fastify.post('/api/messages', { preHandler: authMiddleware }, sendMessageRoute);
```

---

## Issue 2: DMs Not Working

**Root Cause:** Frontend doesn't have proper DM API integration

The frontend doesn't use the DM endpoints correctly:
- Backend has `GET /api/dm` and `GET /api/dm/:agent_id` ✅
- Frontend doesn't implement proper DM UI/API calls ❌

---

## Issue 3: Token Tracking Shows Zeros

**Root Cause:** Frontend calling wrong cost endpoint

The `Costs.tsx` page calls:
```javascript
// WRONG - returns legacy format
costsApi.getSummary({ from, to, group_by: 'day' }) 
// → calls GET /api/costs/summary
```

But should call:
```javascript
// CORRECT - returns live data with totalSpent, perModelBreakdown
costsApi.getLive()
// → should call GET /api/costs/live
```

**Backend Response from `/api/costs/live`:**
```json
{
  "totalSpent": 0.355372,
  "budgetRemaining": 2999.644628,
  "perModelBreakdown": [
    { "model": "openai/gpt-5.1", "requests": 12, "costUsd": 0.105318 },
    { "model": "openai/gpt-4o", "requests": 11, "costUsd": 0.10466 }
  ]
}
```

---

## Issue 4: Duplicate Data (Cleanup Needed)

**Database State:**

### Projects (6 total, 3 unique names)
```
NYC Sewer Infrastructure - 2 duplicates (20:26:34, 20:28:42)
TMNT Agent Network - 2 duplicates (20:26:34, 20:28:42)
PROJECT-CLAW Core - 2 duplicates (20:26:34, 20:28:42)
```

### Agents (12 total, 6 unique names)
```
Leonardo - 2 duplicates
Donatello - 2 duplicates
Raphael - 2 duplicates
Michelangelo - 2 duplicates
Splinter - 2 duplicates
April - 2 duplicates
```

**Cause:** Seed script was run twice (different timestamps: 20:26:34 vs 20:28:42)

---

## Issue 5: Missing Frontend API Methods

The `chatApi` in `web-hq/src/services/api.ts` needs these methods but they don't exist:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getDmChannels()` | `GET /api/dm` | List user's DM channels |
| `getDmHistory(agentId)` | `GET /api/dm/:agent_id` | Get DM messages |
| `sendDm(agentId, content)` | `POST /api/dm/:agent_id` | Send DM to agent |

---

## Current Backend API Structure (Verified Working)

```
Auth:
  POST /api/auth/login
  POST /api/auth/logout
  GET  /api/auth/me

Projects:
  GET  /api/projects
  GET  /api/projects/:id
  POST /api/projects
  PATCH /api/projects/:id/status
  GET  /api/projects/:id/tasks

Tasks:
  POST /api/tasks

Agents:
  GET  /api/agents
  GET  /api/agents/:id

Chat:
  GET  /api/messages/:channel
  POST /api/messages
  PATCH /api/messages/:id
  DELETE /api/messages/:id

DMs:
  GET  /api/dm
  GET  /api/dm/:agent_id
  POST /api/dm/:agent_id

Costs:
  GET  /api/costs/actual
  GET  /api/costs/live        ← USE THIS ONE
  GET  /api/costs/budget
  GET  /api/costs/models
  GET  /api/costs/credits
  POST /api/costs/sync
```

---

## Summary

| Issue | Severity | Cause | Fix Location |
|-------|----------|-------|--------------|
| Chat not sending | 🔴 HIGH | API endpoint mismatch | `web-hq/src/services/api.ts` |
| DMs not working | 🔴 HIGH | Missing DM API methods | `web-hq/src/services/api.ts` |
| Token tracking zeros | 🔴 HIGH | Wrong cost endpoint | `web-hq/src/services/api.ts` + `Costs.tsx` |
| Duplicate projects | 🟡 MEDIUM | Double seed run | Database cleanup |
| Duplicate agents | 🟡 MEDIUM | Double seed run | Database cleanup |

---

## Recommendation

**Delegate fixes to:**
- **Michelangelo** → Fix frontend API calls in `services/api.ts`
- **Donatello** → Add missing chat API endpoints if needed
- **Raphael** → Clean up duplicate database records

See `DEBUGGING-PLAN.md` for detailed task assignments.

---

*Report by: Leonardo (TMNT Leader)*
