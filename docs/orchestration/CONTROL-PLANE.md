# Control Plane (Head Orchestrator Model)

This project now follows a top-down orchestration model:

1. **Head Orchestrator (OpenClaw main assistant)**
   - Owns global priorities, routing, safety gates, and acceptance decisions.
   - Assigns work to PM agents only (not directly to all workers by default).

2. **PM Agents (project-scoped managers)**
   - Own one project stream each.
   - Break work into tasks, assign worker agents, track progress, escalate blockers.

3. **Worker/R&D Agents**
   - Execute assigned tasks.
   - Report status to PM; escalate only when blocked or policy requires.

## Command Hierarchy

- Worker -> PM -> Head Orchestrator
- PM -> Head Orchestrator
- Head Orchestrator -> PM + Policy updates

## Baseline Operating Rules

- PMs can assign workers only inside their project scope.
- Workers cannot self-assign to unrelated projects.
- Any cross-project reassignment requires Head Orchestrator approval.
- Provider policy defaults to local-first (`AI_PROVIDER=ollama` or `auto`).

## Demo Set (clean baseline)

Kept active/approved for demonstration:
- `@testagent2` (worker)
- `@pmatlas` (pm)

All old agents are archived (`is_approved=0`, `status=offline`) and can be re-enabled later.

## Re-enable archived agents

Use admin tooling or DB update to set:
- `is_approved=1`
- `status='online'` (or `offline` until launched)
