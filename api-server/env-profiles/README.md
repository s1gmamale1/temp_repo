# Environment Profiles

Pre-built `.env` configurations for common deployment modes.

## Available Profiles

| Profile | File | AI Provider | Notes |
|---------|------|-------------|-------|
| `local-ollama` | `local-ollama.env` | Ollama only | No API key needed. All inference is local. |
| `hybrid-auto` | `hybrid-auto.env` | Ollama → OpenRouter | Tries Ollama first; falls back to OpenRouter if key is set. |

---

## Switching Profiles

```bash
# From api-server/
node scripts/switch-env-profile.js local-ollama
node scripts/switch-env-profile.js hybrid-auto
```

This overwrites `api-server/.env` with the selected profile.
**Restart the API server after switching.**

---

## Profile Details

### `local-ollama` — Fully Local

```ini
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_PM=qwen2.5-coder:7b
OLLAMA_MODEL_RND=qwen2.5-coder:7b
OLLAMA_MODEL_WORKER=qwen2.5-coder:7b
```

- No external API key required
- Tasks are simulated if Ollama is not running
- Set `OLLAMA_BASE_URL` to Mac Mini LAN IP for remote Ollama inference
- Fastest startup; zero cost

**When to use:** Development, offline work, Mac Mini / LAN deployments.

---

### `hybrid-auto` — Local + Cloud Fallback

```ini
AI_PROVIDER=auto
OLLAMA_BASE_URL=http://localhost:11434
# OPENROUTER_API_KEY=sk-or-...   ← add your key to enable cloud fallback
```

- Checks Ollama reachability at each task execution
- If Ollama is unreachable AND `OPENROUTER_API_KEY` is set → uses OpenRouter
- If neither is available → simulation mode (no crash)
- Add `OPENROUTER_API_KEY` to the `.env` after switching to enable cloud fallback

**When to use:** Mixed environments where Ollama may not always be available.

---

## Custom Profile

To create a custom profile, copy an existing `.env` file into this directory
and name it `<profile-name>.env`. Then switch to it with:

```bash
node scripts/switch-env-profile.js <profile-name>
```

---

## Key Variables Reference

| Variable | Default | Notes |
|----------|---------|-------|
| `AI_PROVIDER` | `auto` | `ollama` \| `openrouter` \| `auto` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Point to Mac Mini IP for remote inference |
| `OLLAMA_MODEL_PM` | `qwen2.5-coder:7b` | Model for PM agent type |
| `OLLAMA_MODEL_RND` | `qwen2.5-coder:7b` | Model for R&D agent type |
| `OLLAMA_MODEL_WORKER` | `qwen2.5-coder:7b` | Model for Worker agent type |
| `OPENROUTER_API_KEY` | — | Required only for `openrouter` or `auto` fallback |
| `JWT_SECRET` | random | Set in production for persistent sessions |

---

## Verifying Active Profile

```bash
# Check which provider the running server is using:
curl http://localhost:3001/health | jq .

# Run the diagnostic script:
node scripts/health-check.js
```
