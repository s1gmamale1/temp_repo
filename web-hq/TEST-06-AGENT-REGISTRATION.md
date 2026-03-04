# SEVERE TEST #6: Agent Self-Registration & Approval Workflow

**Test Date:** 2026-02-28  
**Tester:** Leonardo (Project Architect)  
**Test Result:** ⚠️ PARTIAL PASS (Critical Issues Found)

---

## Executive Summary

The agent registration and approval workflow is **functional but has significant gaps**:
- ✅ Agent registration works
- ✅ Status correctly shows "pending" initially
- ✅ Admin approval workflow works
- ❌ **No duplicate detection** - same agent can register multiple times
- ❌ **No rejection workflow** - missing reject/delete endpoints
- ⚠️ **Status inconsistency** - `config.status` doesn't update after approval

---

## Test Steps & Results

### STEP 1: Register New Agent
**Status:** ✅ PASSED

**Request:**
```bash
POST /api/agents/register
{
  "name": "TestAgent_Leo_006",
  "email": "testagent.leo.006@web-hq.local",
  "role": "field_ops",
  "public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIhz2GK/XCUj4i6Q5yQJNL1MXMY0RxzPV2QrBqfHrDq testagent.leo.006"
}
```

**Response:**
```json
{
  "id": "01d7c1b8-86c3-4238-9ee2-bc3c05a7068d",
  "name": "TestAgent_Leo_006",
  "role": "field_ops",
  "status": "pending",
  "message": "Agent registration pending approval"
}
```

---

### STEP 2: Verify Agent Status is "pending"
**Status:** ✅ PASSED (with note)

**Request:**
```bash
GET /api/agents/01d7c1b8-86c3-4238-9ee2-bc3c05a7068d
```

**Response:**
```json
{
  "id": "01d7c1b8-86c3-4238-9ee2-bc3c05a7068d",
  "name": "TestAgent_Leo_006",
  "status": "idle",
  "config": {
    "status": "pending"
  },
  "is_active": 0,
  ...
}
```

**Note:** Status appears in two places:
- `status`: "idle" (top-level)
- `config.status`: "pending" (nested)

The `is_active: 0` correctly indicates pending status.

---

### STEP 3: Login as Scorpion (Admin)
**Status:** ✅ PASSED (after correction)

**Issue Found:** Login endpoint expects `login` field, not `username`.

**Working Request:**
```bash
POST /api/auth/login
{
  "login": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "user": {
    "id": "48fc0151-84b6-4996-b0ad-d99acf9feadf",
    "name": "Admin User",
    "role": "admin"
  },
  "session": {
    "token": "sess_iWSAzD940HAJ4xls1jTAr7RfTcCxTfcynP8hv0l5qg2v7sbA",
    "expires_at": "2026-03-01T10:44:19.480Z"
  }
}
```

---

### STEP 4: Approve Agent (Admin Action)
**Status:** ✅ PASSED

**Request:**
```bash
POST /api/agents/approve/01d7c1b8-86c3-4238-9ee2-bc3c05a7068d
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "id": "01d7c1b8-86c3-4238-9ee2-bc3c05a7068d",
  "name": "TestAgent_Leo_006",
  "status": "approved",
  "message": "Agent approved successfully"
}
```

---

### STEP 5: Test Approved Agent System Access
**Status:** ✅ PASSED

**Verification:**
```bash
GET /api/agents/01d7c1b8-86c3-4238-9ee2-bc3c05a7068d
```

**Response:**
```json
{
  "id": "01d7c1b8-86c3-4238-9ee2-bc3c05a7068d",
  "name": "TestAgent_Leo_006",
  "status": "idle",
  "config": {
    "status": "pending"  // ⚠️ Still shows pending!
  },
  "is_active": 1,  // ✅ Now active
  "updated_at": "2026-02-28T10:44:52.722Z"
}
```

**Note:** `is_active: 1` confirms approval worked, but `config.status` wasn't updated.

---

### STEP 6: Try Duplicate Registration
**Status:** ❌ FAILED

**Expected:** Error - agent already exists

**Actual:** Second registration succeeded!

**Request:**
```bash
POST /api/agents/register
{
  "name": "TestAgent_Leo_006",
  "email": "testagent.leo.006@web-hq.local",
  ...
}
```

**Response:**
```json
{
  "id": "ad360f37-8f03-4790-9f16-d0962d81c176",  // New ID!
  "name": "TestAgent_Leo_006",
  "status": "pending",
  "message": "Agent registration pending approval"
}
```

**🚨 CRITICAL BUG:** No uniqueness check on agent name or public key!

---

### STEP 7: Test Rejection Workflow
**Status:** ❌ FAILED

**Missing Endpoints:**
- `POST /api/agents/reject/:id` → 404 Not Found
- `DELETE /api/agents/:id` → 404 Not Found

**Current Workaround:** None. Admins cannot reject or delete agents.

**Pending Agents Count:** 3 (including our duplicate)

---

## Issues Found

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | **No duplicate detection** | 🔴 CRITICAL | `registerAgentRoute` in routes.js |
| 2 | **No rejection endpoint** | 🔴 CRITICAL | routes.js missing reject route |
| 3 | **No delete agent endpoint** | 🟠 HIGH | routes.js missing DELETE route |
| 4 | **Status inconsistency** | 🟡 MEDIUM | `config.status` not updated on approval |
| 5 | **Documentation gap** | 🟡 MEDIUM | Login expects `login` not `username` |

---

## Recommendations

### Immediate (Before Production)

1. **Add Duplicate Check in Registration:**
   ```javascript
   // Check for existing agent by name or public_key
   const existing = db.prepare('SELECT * FROM agents WHERE name = ? OR public_key = ?').get(name, public_key);
   if (existing) {
     reply.code(409);
     return { error: 'Agent with this name or public key already exists' };
   }
   ```

2. **Add Rejection Endpoint:**
   ```javascript
   // POST /api/agents/reject/:id
   async function rejectAgentRoute(request, reply) {
     // Set is_active = 0, status = 'rejected'
     // Optionally store rejection reason
   }
   ```

3. **Add Delete Endpoint (Admin Only):**
   ```javascript
   // DELETE /api/agents/:id
   async function deleteAgentRoute(request, reply) {
     // Soft delete or hard delete with admin check
   }
   ```

### Short Term

4. **Fix Status Consistency:**
   - Update `config.status` when approval changes status
   - Or deprecate `config.status` and use only top-level `status`

5. **Update API Documentation:**
   - Document login field is `login` not `username`
   - List all available agent endpoints

### Security Enhancements

6. **Add Rate Limiting to Registration:**
   - Prevent spam registrations
   - IP-based or global rate limit

7. **Email Verification:**
   - Send verification email before pending status
   - Prevent fake agent registrations

---

## API Endpoint Summary

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/agents/register` | ✅ Working | Creates pending agent |
| POST | `/api/agents/approve/:id` | ✅ Working | Requires admin auth |
| GET | `/api/agents/pending` | ✅ Working | Lists pending agents |
| GET | `/api/agents/:id` | ✅ Working | Get agent details |
| GET | `/api/agents` | ✅ Working | List all agents |
| POST | `/api/agents/reject/:id` | ❌ Missing | Needed for rejection |
| DELETE | `/api/agents/:id` | ❌ Missing | Needed for cleanup |

---

## Conclusion

The agent registration workflow has a solid foundation but **requires critical fixes** before production deployment:

1. **Duplicate registration must be blocked** - this is a data integrity issue
2. **Rejection workflow must be implemented** - admins need this capability
3. **Agent cleanup/deletion should be available** - for managing stale registrations

The approval workflow itself works correctly - the issue is the missing "negative" paths (rejection, duplicate prevention, deletion).

**Overall Grade: C+** (Functional core, critical gaps in edge cases)

---

*Report generated by Leonardo (TMNT Project Architect)*  
*"We strike hard and fade away... into the system logs."*
