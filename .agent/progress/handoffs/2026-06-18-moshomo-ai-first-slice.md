# Moshomo AI — Provider-Agnostic Read-Only Assistant (First Slice)

## Goal

Strip/copy Pori into a native, company-scoped, permission-gated, auditable workforce
assistant — the first vertical slice from `docs/architecture/moshomo-ai-design.md`:
`actor context -> read-only tools -> assistant route -> auditable assistant_runs row`.

User decisions: **provider-agnostic like Pori — implement Anthropic + OpenAI + Google now**;
**default `anthropic` / `claude-sonnet-4-6`** (config-driven). Read-only only (no write tools).

## Completed (`apps/api/src/moshomo_ai/`)

- **LLM layer** (`llm/`): `base.py` (provider-neutral `LLMClient` protocol + normalized
  `ToolSpec`/`ToolCall`/`LLMMessage`/`LLMStep`/`LLMUsage`), `anthropic.py` (native tool_use),
  `openai.py` (function calling), `google.py` (function declarations), `schema.py`
  (strips Pydantic `title` for portability), `factory.py` (`build_llm_client`/`get_llm_client`,
  503 if the selected provider's key is missing). Each client translates the normalized
  transcript ⇄ its SDK; the loop/tools/audit never branch on vendor.
- **Tools** (`tools/`): `registry.py` (Pori-style Pydantic registry + `ToolExecutor` that
  validates args and never lets a tool crash the loop), `workforce.py` =
  `search_employees`, `get_employee_profile`, `get_company_knowledge`. Tools read via the
  **caller's** Supabase token → RLS, not the tool, enforces visibility. Registry holds no
  write tools (the read-only boundary).
- **Loop + audit**: `agent.py` (manual loop, capped by `MOSHOMO_AI_MAX_STEPS`, handles
  tool calls / final answer / refusal / step-exhaustion), `runs.py`
  (`run_workforce_assistant` → inserts **one** `assistant_runs` row at completion;
  no UPDATE needed since that table is insert-only under RLS), `context.py` (`RunContext`
  carrying actor + rest client + citations), `prompts/workforce_assistant.md` + `prompts.py`.
- **Route**: `POST /workforce/assistant` now runs the real assistant (deleted
  `pori_adapter.py`). Returns `{run_id, status, answer, refusal_reason, citations,
  provider, model}`.
- **Config/deps**: added `anthropic`, `openai`, `google-genai`; config
  `moshomo_ai_provider/model/max_steps/max_tokens/request_timeout_seconds` +
  `anthropic/openai/google_api_key` (env prefix `MOSHOMO_`).

## Verification

- `uv run --project apps/api python -m compileall apps/api/src` — clean.
- `uv run --project apps/api pytest apps/api/tests -q` — **27 passed** (21 prior + 6 new
  `test_workforce_assistant.py`: tool-call+citations+audit, company-scoped actor token,
  invalid-args recovery, refusal recorded, 503 when unconfigured, read-only registry).
- All three provider modules import + construct; Google `FunctionDeclaration`s and all
  three message converters build from the real tool schemas. No live LLM/network in tests.

## Design notes / decisions

- Extended thinking is **off** for the Anthropic client: the loop rebuilds history from the
  normalized transcript each step, which can't faithfully echo provider-internal thinking
  blocks back (Anthropic would 400). Fine for a read-only lookup assistant.
- Cross-provider refusal detection is best-effort (only Anthropic exposes an explicit
  `refusal` stop reason). OpenAI/Google refusals arrive as normal text.

## Not done / follow-ups

- **Run it live**: needs an API key (`MOSHOMO_ANTHROPIC_API_KEY` etc.) + applied Supabase
  data to integration-test the endpoint and the provider seam (switch
  `MOSHOMO_AI_PROVIDER`/`MOSHOMO_AI_MODEL`).
- Guarded **write** tools (leave/shift drafts) behind deterministic policy + HITL approval.
- Streaming/background runs (need a service-role `assistant_runs` updater) + multi-turn
  conversations (`conversation_id`). Usage/trace tables. Per-company model/provider config.
- Wire web/mobile "Ask Moshomo" UI to `POST /workforce/assistant`.
- Still pending approval: migrations `...000300_company_branding`, `...000400_employee_documents`.
