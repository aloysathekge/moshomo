# Moshomo AI Design

## Purpose

Moshomo AI is the native assistant layer for Moshomo. It is inspired by Pori, but it is not Pori as a dependency or product identity.

Moshomo AI must understand company context, workforce permissions, employee records, leave, shifts, policy, and safe approval workflows.

## Design Decision

Build `moshomo_ai` inside `apps/api` first.

Start small:

```txt
apps/api/src/moshomo_ai/
├── __init__.py
├── context.py
├── tools/
│   ├── __init__.py
│   ├── registry.py
│   └── employees.py
├── memory/
│   ├── __init__.py
│   └── models.py
├── prompts/
│   └── workforce_assistant.md
└── runs.py
```

Only move it to `packages/moshomo-ai` after the boundary is stable.

## What We Copy From Pori

Keep the ideas, not the generic product.

From `Pori/Pori/pori/tools/registry.py`:

- Pydantic tool parameters.
- Tool descriptions.
- Explicit tool registry.
- Tool executor boundary.

From Pori memory contracts:

- memory kind: semantic, episodic, procedural
- sensitivity: public, internal, confidential, restricted
- provenance
- retention
- conflict policy
- soft delete

From Pori run/orchestration:

- run status
- tool call history
- traces
- usage/metrics later
- background execution later

## What We Strip

Do not copy into Moshomo AI runtime:

- Pori branding.
- Generic CLI.
- Filesystem tools.
- Generic web search.
- Generic arbitrary tool configuration.
- Generic team modes.
- Generic user-only memory scope.
- Any model-controlled write path without a Moshomo policy gate.

## Runtime Context

Every Moshomo AI run must have:

- `company_id`
- `actor_user_id`
- `actor_role`
- optional `employee_id`
- permissions/scope
- request source: web, mobile, API, automation

The model should never decide its own tenant, actor, or permissions.

## Memory Layers

### Company Knowledge

Use for:

- leave policy
- shift policy
- company procedures
- department rules
- uploaded company documents

Scope:

- company-wide, permission-gated by sensitivity.

### Employee Memory

Use for:

- employee preferences
- availability notes
- certifications
- skill notes
- scheduling constraints

Scope:

- tied to one employee and one company.
- managers/admins need explicit permission to read it.

### Run Memory

Use for:

- current question
- extracted intent
- tool calls
- proposed action
- final answer
- reasoning summary

Scope:

- actor, company, and affected records.

## First Read-Only Tools

Build read-only tools before write tools.

### get_employee_profile

Input:

- `employee_id`

Output:

- employee fields allowed for the actor.

Rules:

- employee can read own profile.
- manager can read assigned employee profiles.
- admin can read company employee profiles.

### search_employees

Input:

- `query`
- optional `department_id`
- optional `status`

Output:

- list of employee summaries allowed for the actor.

### get_company_knowledge

Input:

- `query`
- optional `tags`

Output:

- relevant company knowledge entries allowed for the actor.

### answer_workforce_question

Input:

- natural-language question

Output:

- answer
- cited tool results or knowledge entries
- refusal reason when permission prevents answering

## Future Write Tools

Do not implement these until deterministic policy checks exist:

- `create_leave_request_draft`
- `approve_leave_if_policy_allows`
- `create_shift_assignment_draft`
- `generate_draft_schedule`
- `suggest_shift_replacements`

Write tools must return drafts first unless the product has an explicit auto-approval policy.

## Prompt Direction

The assistant should be told:

- You are Moshomo AI.
- You help with workforce operations.
- You can only answer from allowed records and company knowledge.
- You must refuse when the user lacks permission.
- You must not invent employee facts, leave balances, shifts, or policies.
- You must distinguish draft suggestions from approved actions.

## First Vertical Slice

Build:

```txt
actor context
-> read-only employee tools
-> company knowledge search
-> assistant route
-> auditable assistant_runs row
```

Expected user-facing behavior:

- Manager asks: "Who is in my team?"
- Moshomo AI calls allowed employee search.
- Moshomo AI answers only with visible employees.
- Tool calls are stored in `assistant_runs`.

## Verification

Initial tests should cover:

- tool param validation
- employee cannot read another employee profile
- manager cannot read outside assigned scope
- admin can read company profiles
- assistant refuses unauthorized questions
- tool calls are recorded

## Implemented First Slice

The read-only first slice is implemented in `apps/api/src/moshomo_ai/`:

- Provider-agnostic LLM layer (`llm/base.py` protocol + `anthropic`, `openai`, `google`
  clients + `factory.py`), selected by config. Default `anthropic` / `claude-sonnet-4-6`;
  per-environment via `MOSHOMO_AI_PROVIDER` / `MOSHOMO_AI_MODEL` and the matching API key.
- A Pori-style Pydantic tool registry (`tools/registry.py`) with three read-only tools
  (`tools/workforce.py`): `search_employees`, `get_employee_profile`, `get_company_knowledge`.
  Tools read through the caller's Supabase token, so RLS — not the tool — enforces visibility.
- A manual agentic loop (`agent.py`) capped by `MOSHOMO_AI_MAX_STEPS`, and a run entrypoint
  (`runs.py`) that inserts one auditable `assistant_runs` row at completion.
- Route `POST /workforce/assistant` (replaces the old `pori_adapter.py` placeholder).

## Resolved Decisions

- Route lives under `/workforce/assistant`.
- `pori_adapter.py` was removed and replaced by `moshomo_ai`.
- First knowledge search uses Postgres `ilike` (full-text / vector deferred).
- Moshomo AI is provider-agnostic (anthropic / openai / google), like Pori.

## Open Decisions

- Exact manager scope model (currently direct-report RLS as built in the foundation).
- Guarded write tools (leave/shift drafts) behind deterministic policy + HITL approval.
- Streaming/background runs (need a service-role `assistant_runs` updater) and multi-turn
  conversations (`conversation_id` threading).
- Usage/trace persistence tables and per-company model/provider config.
