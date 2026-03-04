# SEVERE TEST #7: Token Dashboard with Real API Calls
**Test Date:** 2026-02-28 15:47 GMT+5  
**Tester:** Donatello (Backend Lead)  
**Status:** COMPLETED WITH FINDINGS

---

## Executive Summary

| Provider | API Status | Key Configured | Real Data | Issues |
|----------|------------|----------------|-----------|--------|
| **Kimi (Moonshot)** | ❌ FAIL | ✅ Yes | ❌ No | Invalid API key, wrong endpoint URLs |
| **OpenAI** | ⚠️ PARTIAL | ✅ Yes | ⚠️ Partial | Billing endpoint requires session key |
| **Claude (Anthropic)** | ❌ FAIL | ✅ Yes | ❌ No | Invalid bearer token |
| **OpenRouter** | ❌ NOT CONFIGURED | ❌ No | ❌ No | Key missing entirely |

---

## 1. API Key Status

### Environment Variables Present:
```
✅ MOONSHOT_API_KEY=sk-***REDACTED***
✅ OPENAI_API_KEY=sk-***REDACTED***
✅ ANTHROPIC_API_KEY=sk-***REDACTED***
❌ OPENROUTER_API_KEY=(not set)
```

### Key Validation Results:

#### Kimi/Moonshot
```bash
$ curl -H "Authorization: Bearer $MOONSHOT_API_KEY" https://api.moonshot.cn/v1/models

Response:
{"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}
```
**Status:** ❌ INVALID KEY

#### OpenAI
```bash
$ curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models

Response: ✅ SUCCESS - Returns model list (gpt-4, gpt-3.5-turbo, etc.)
```
**Status:** ✅ VALID KEY

#### Anthropic/Claude
```bash
$ curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
       -H "anthropic-version: 2023-06-01" \
       https://api.anthropic.com/v1/models

Response:
{"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}
```
**Status:** ❌ INVALID KEY

---

## 2. Live Cost Endpoint Tests

### Endpoint: `GET /api/costs/live`

**Test Result:**
```bash
$ curl http://localhost:3001/api/costs/live

Response:
{"statusCode":401,"error":"Unauthorized","message":"Unauthorized - No token provided"}
```

**Analysis:** 
- ✅ Server is running and responding
- ✅ Endpoint exists
- ❌ Requires authentication (JWT token)

### Endpoint: `GET /api/tokens/dashboard`

**Test Result:**
```bash
$ curl http://localhost:3001/api/tokens/dashboard

Response:
{"statusCode":401,"error":"Unauthorized","message":"Unauthorized - No token provided"}
```

**Analysis:**
- ✅ Endpoint exists
- ❌ Requires authentication

### Endpoint: `GET /api/tokens/status`

**Test Result:**
```bash
$ curl http://localhost:3001/api/tokens/status

Response:
{"statusCode":401,"error":"Unauthorized","message":"Unauthorized - No token provided"}
```

---

## 3. Direct API Provider Tests

### 3.1 Kimi (Moonshot) - REAL DATA TEST

**Models Endpoint:**
```bash
GET https://api.moonshot.cn/v1/models

Response: {"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}
```
❌ **FAIL** - Invalid API key

**Usage Endpoint:**
```bash
GET https://api.moonshot.cn/v1/usage

Response: {"code":5,"error":"url.not_found","message":"没找到对象","method":"GET","scode":"0x5","status":false}
```
❌ **FAIL** - Endpoint doesn't exist

**Balance Endpoint:**
```bash
GET https://api.moonshot.cn/v1/balance

Response: {"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}
```
❌ **FAIL** - Invalid API key

**Conclusion:** Kimi API is returning authentication errors. The API key in `.env` is either:
1. Expired/revoked
2. Incorrect format
3. From wrong account

---

### 3.2 OpenAI - REAL DATA TEST

**Models Endpoint:**
```bash
GET https://api.openai.com/v1/models

Response: ✅ SUCCESS
{
  "object": "list",
  "data": [
    {"id": "gpt-4-0613", "object": "model", ...},
    {"id": "gpt-4", "object": "model", ...},
    {"id": "gpt-3.5-turbo", "object": "model", ...},
    {"id": "gpt-4o-search-preview-2025-03-11", "object": "model", ...},
    {"id": "gpt-5.3-codex", "object": "model", ...},
    ...
  ]
}
```
✅ **SUCCESS** - Returns real model data

**Usage Endpoint:**
```bash
GET https://api.openai.com/v1/usage?date=2026-02-28

Response:
{
  "object": "list",
  "data": [],
  "assistant_code_interpreter_data": [],
  "dalle_api_data": [],
  ...
}
```
⚠️ **EMPTY DATA** - No usage recorded for today

**Billing Endpoint:**
```bash
GET https://api.openai.com/v1/dashboard/billing/subscription

Response:
{
  "error": {
    "message": "Your request to GET /v1/dashboard/billing/subscription must be made with a session key..."
  }
}
```
❌ **FAIL** - Requires browser session key, not API key

**Conclusion:** 
- ✅ OpenAI API key is valid
- ✅ Models endpoint works
- ⚠️ Usage data is empty (no API calls made today)
- ❌ Billing endpoint requires different authentication

---

### 3.3 Claude (Anthropic) - REAL DATA TEST

**Models Endpoint:**
```bash
GET https://api.anthropic.com/v1/models
Authorization: Bearer $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01

Response:
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Invalid bearer token"
  },
  "request_id": "req_011CYaLHJkD7wDDDKBeQomni"
}
```
❌ **FAIL** - Invalid API key

**Usage Endpoint:**
Anthropic does not provide a public usage/credit API.

**Conclusion:** 
- ❌ Anthropic API key is invalid
- ❌ No usage API available from Anthropic
- ⚠️ Must use OpenRouter for Claude cost tracking

---

### 3.4 OpenRouter - REAL DATA TEST

**Status:** NOT TESTED (No API key configured)

```bash
$ echo $OPENROUTER_API_KEY
(nothing - empty)
```

**Expected Endpoints (from code):**
- `GET /api/v1/credits` - Credit balance
- `GET /api/v1/usage` - Usage data

**Conclusion:**
- ❌ OPENROUTER_API_KEY not set in `.env`
- ❌ Cannot test OpenRouter integration
- ⚠️ This is the ONLY working path for Claude cost tracking

---

## 4. Cost Data Verification

### Database Check: `cost_records` Table

```sql
SELECT COUNT(*) as total_records FROM cost_records;
-- Result: 0

SELECT * FROM cost_records LIMIT 5;
-- Result: (no output)
```

**Conclusion:** 
- ❌ No cost records in database
- ❌ All cost data is currently mock/placeholder
- ⚠️ Need to make actual API calls to populate data

### Table Schema Verification:
```sql
CREATE TABLE cost_records (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    user_id TEXT REFERENCES users(id),
    model TEXT NOT NULL,
    provider TEXT DEFAULT 'openrouter',
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    cost_per_1k_prompt REAL,
    cost_per_1k_completion REAL,
    request_id TEXT,
    is_cached INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    recorded_at TEXT DEFAULT (datetime('now'))
);
```
✅ **Table schema is correct**

---

## 5. Token Tracking Features

### Context Token Tracking
- ✅ Code exists in `token-dashboard.js`
- ✅ Tracks tokens by model
- ✅ Calculates context window percentage
- ✅ Alerts at 80% threshold
- ❌ No real data to test with

### Daily/Weekly/Monthly Breakdowns
- ✅ Code exists in `routes.js` and `openrouter.js`
- ✅ SQL queries support grouping by day/week/month
- ❌ No data to verify breakdown accuracy

### Provider Status Checking
- ✅ `checkProviderStatus()` function implemented
- ❌ Only OpenAI returns valid status
- ❌ Kimi and Anthropic fail authentication

---

## 6. Code Issues Found

### Issue 1: `real-costs.js` - Wrong API Parameters

**Current Code:**
```javascript
// Wrong - OpenAI usage API needs 'date' parameter, not 'start_date'/'end_date'
const usageResponse = await axios.get(
  `${PROVIDERS.openai.apiUrl}/usage?start_date=${startDate}&end_date=${endDate}`,
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
);
```

**Correct API Call:**
```bash
GET https://api.openai.com/v1/usage?date=2026-02-28
```

**Severity:** MEDIUM - Returns error instead of usage data

### Issue 2: Kimi API - Wrong Endpoints

**Current Code:**
```javascript
// These endpoints don't exist
await axios.get(`${PROVIDERS.kimi.apiUrl}/usage`, ...)
await axios.get(`${PROVIDERS.kimi.apiUrl}/balance`, ...)
```

**Actual Kimi Endpoints:**
- `/v1/models` - List models ✅
- `/v1/chat/completions` - Chat ✅
- No public usage/balance API ❌

**Severity:** HIGH - Module will always return errors

### Issue 3: Anthropic Has No Usage API

**Current Code:**
Attempts to get Anthropic usage via API.

**Reality:**
Anthropic does NOT provide a usage/credit API. Must use:
1. OpenRouter integration
2. Manual tracking via `cost_records` table

**Severity:** MEDIUM - Code handles this gracefully but documents it poorly

---

## 7. Summary of Real vs Mock Data

| Data Source | Real API | Mock Data | Notes |
|-------------|----------|-----------|-------|
| Kimi Credit Balance | ❌ | ✅ | No API key valid |
| Kimi Usage | ❌ | ✅ | No usage endpoint exists |
| OpenAI Models | ✅ | ❌ | Returns real list |
| OpenAI Usage | ⚠️ | ✅ | Returns empty (no usage) |
| OpenAI Billing | ❌ | ✅ | Requires session key |
| Claude Models | ❌ | ✅ | No API key valid |
| Claude Usage | ❌ | ✅ | No public API |
| OpenRouter Credits | ❌ | ✅ | Key not configured |
| Local cost_records | ❌ | ✅ | Table is empty |

---

## 8. Recommendations

### Immediate Actions Required:

1. **Fix Kimi API Key**
   - Generate new API key from Moonshot console
   - Update `.env` file
   - Verify with: `curl -H "Authorization: Bearer $MOONSHOT_API_KEY" https://api.moonshot.cn/v1/models`

2. **Fix Anthropic API Key**
   - Generate new API key from Anthropic console
   - Update `.env` file
   - Or remove Claude direct integration and rely on OpenRouter

3. **Add OpenRouter API Key**
   - Create account at openrouter.ai
   - Generate API key
   - Add `OPENROUTER_API_KEY=sk-or-v1-...` to `.env`

4. **Fix OpenAI Usage API Call**
   - Change from `start_date/end_date` to `date` parameter
   - Make one call per day for date range

5. **Fix Kimi API Endpoints**
   - Remove `/usage` and `/balance` calls
   - Kimi doesn't provide these endpoints
   - Use OpenRouter for Kimi cost tracking

### Long-term Improvements:

1. **Add Authentication Bypass for Testing**
   - Create test-only endpoints that skip JWT
   - Or add test JWT token generation

2. **Implement Real API Call Tracking**
   - Hook into chat completions
   - Record actual token usage to `cost_records`
   - Display in dashboard

3. **Add Provider Fallback**
   - If direct API fails, try OpenRouter
   - If OpenRouter fails, use estimates

---

## 9. Test Output Log

```
=== KIMI API TEST ===
{"error":{"message":"Invalid Authentication","type":"invalid_authentication_error"}}

=== OPENAI API TEST ===
{"object": "list", "data": [...models...]}

=== ANTHROPIC API TEST ===
{"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}

=== KIMI USAGE ENDPOINT ===
{"code":5,"error":"url.not_found","message":"没找到对象"}

=== OPENAI USAGE ENDPOINT ===
{"object": "list", "data": [], "dalle_api_data": [], ...}

=== OPENAI BILLING ENDPOINT ===
{"error":{"message":"must be made with a session key"}}

Database: cost_records table exists, 0 rows
Server health: {"status":"ok","timestamp":"2026-02-28T10:47:01.804Z"}
```

---

## Conclusion

**Test Status:** ⚠️ PARTIAL SUCCESS

The Token Dashboard infrastructure is in place and the code structure is correct. However:

1. **Only OpenAI API key is valid** (but returns empty usage data)
2. **Kimi and Anthropic keys are invalid** or endpoints don't exist
3. **OpenRouter is not configured** (needed for Claude tracking)
4. **No real cost data exists** in the database

The dashboard will display **mock/placeholder data** until:
- API keys are fixed
- Real API calls are made
- Cost tracking is hooked into the chat system

**Next Steps:**
1. Fix/replace API keys
2. Make test API calls to populate data
3. Re-run this test to verify real data flows through

---
*End of Test Report #7*
