# Pori To Moshomo AI Evaluation

## Decision

Pori will not be used as a long-term external dependency or generic assistant layer.

Moshomo will use Pori as source material, then copy, strip, rename, and rebuild the useful parts into a native `Moshomo AI` system for workforce operations.

## Target

Moshomo AI should be company-native:

- Each company has isolated memory.
- Each company has a knowledge base.
- Each company has workforce-specific tools.
- AI actions are constrained by Moshomo permissions, policies, and data.
- The assistant speaks the Moshomo domain: employees, leave, shifts, coverage, fairness, and manager approvals.

## Pori Pieces To Keep

### Agent Loop

Source: `Pori/Pori/pori/agent.py`

Keep the task loop, structured tool calls, step limits, failure limits, planning/reflection modes, final answer validation, metrics, traces, and human-in-the-loop gates.

Change for Moshomo:

- Replace generic task language with workforce assistant behavior.
- Add company, user, role, and permission context to every run.
- Treat mutations as guarded workflow actions, not ordinary tools.
- Make auditability a first-class requirement.

### Tool Registry

Source: `Pori/Pori/pori/tools/registry.py`

Keep Pydantic-validated tool params, decorator-based registration, tool descriptions for prompts, and the explicit tool execution boundary.

Change for Moshomo:

- Remove generic filesystem, web, math, and arbitrary utility tools from the product runtime.
- Add native workforce tools like `get_employee_profile`, `search_employees`, `get_leave_balance`, `create_leave_request_draft`, `get_team_calendar`, `find_shift_gaps`, `suggest_replacements`, `generate_draft_schedule`, and `explain_policy`.

### Memory Contracts

Sources:

- `Pori/Pori/pori/memory_contracts.py`
- `Pori/Pori/pori/memory.py`
- `Pori/pori_cloud/pori_cloud/routes/memory.py`
- `Pori/pori_cloud/pori_cloud/models.py`

Keep memory kinds, sensitivity levels, conflict policies, retention rules, provenance, soft delete, legal hold ideas, and hybrid lexical/semantic retrieval.

Change for Moshomo:

- Rename generic scope to Moshomo concepts: `company_id`, `actor_user_id`, `employee_id`, `assistant_id`, and `conversation_id`.
- Separate company knowledge from personal employee memory.
- Enforce company isolation in Supabase RLS and API permission checks.
- Add source categories: policy document, manager note, employee profile, leave record, shift record, uploaded document, and assistant observation.

### Cloud Service Patterns

Sources:

- `Pori/pori_cloud/pori_cloud/models.py`
- `Pori/pori_cloud/pori_cloud/routes/runs.py`
- `Pori/pori_cloud/pori_cloud/routes/conversations.py`
- `Pori/pori_cloud/pori_cloud/streaming.py`
- `Pori/pori_cloud/pori_cloud/background.py`

Keep conversations, messages, runs, background execution, trace records, usage records, and streaming responses.

Change for Moshomo:

- Conversations belong to a company and actor.
- Runs must store assistant query, proposed action, approval state, and affected workforce records.
- Usage must support per-company usage reporting.
- Streaming must not leak hidden tool details or unauthorized records.

### Observability And Evals

Sources:

- `Pori/Pori/pori/observability/`
- `Pori/Pori/pori/eval/`
- `Pori/Pori/pori/metrics.py`

Keep traces, step metrics, eval/guardrail concepts, and reliability checks for tool calls.

Change for Moshomo:

- Add evals for cross-company memory isolation, unauthorized employee data exposure, leave intent extraction, schedule fairness, auto-approval correctness, and replacement suggestion quality.

## Pori Pieces To Strip

- Generic CLI.
- Generic filesystem tools.
- Generic web search tools.
- Generic math/number tools unless needed for scheduling calculations.
- Public Pori branding, names, prompts, docs, and package identifiers.
- Multi-agent team modes until a concrete Moshomo use case needs them.
- User-configurable arbitrary tools.
- Generic agent config UI concepts.
- Any behavior that lets the model mutate memory or workforce records without a Moshomo policy gate.

## Moshomo AI Proposed Shape

Initial package inside `apps/api`:

```txt
apps/api/src/moshomo_ai/
├── agent.py
├── memory/
│   ├── models.py
│   ├── repository.py
│   └── retrieval.py
├── tools/
│   ├── registry.py
│   ├── employees.py
│   ├── leave.py
│   ├── shifts.py
│   └── policies.py
├── runs.py
├── prompts/
│   └── workforce_assistant.md
├── guardrails.py
├── evals.py
└── telemetry.py
```

Later, if it becomes large enough, `moshomo_ai` can move into its own package:

```txt
packages/moshomo-ai/
```

## Company Memory Model

Moshomo AI needs three memory layers.

### Company Knowledge Base

Company-wide knowledge that authorized users can query: leave policies, shift rules, departments, role expectations, uploaded company docs, and internal workforce procedures.

### Employee Memory

Employee-specific facts: availability preferences, leave context, certifications, skills, scheduling constraints, and assistant-relevant notes.

This must be permission-gated. Employees see their own data; managers see allowed team data; admins see company-wide data.

### Assistant Run Memory

Conversation and task-local memory: current request, extracted intent, tool calls, draft action, approval state, and final answer.

This should be auditable and connected to affected workforce records.

## Copy/Strip Plan

Do not copy Pori wholesale into the product path first.

Recommended sequence:

1. Create `docs/architecture/moshomo-ai-design.md` from this evaluation.
2. Copy only the tool registry and memory contract ideas first.
3. Rename and simplify into `moshomo_ai`.
4. Add company-scoped memory models before any assistant feature depends on memory.
5. Add read-only workforce tools.
6. Add the assistant run loop.
7. Add guarded write tools only after permission and policy checks exist.
8. Add evals for isolation, permissions, and workforce correctness.

## First Moshomo AI Slice

Build this before schedule generation:

```txt
authenticated actor
-> company scope
-> read-only employee/profile tools
-> company memory/knowledge search
-> assistant answer with citations to allowed records
```

Success means:

- a manager can ask a workforce question
- Moshomo AI only sees records they are allowed to see
- the answer is grounded in Moshomo data
- tool calls and reasoning summary are auditable

## Risks

- Blind copy could preserve Pori product assumptions that do not fit HR/workforce data.
- Generic memory could leak across companies if company scope is not enforced at every layer.
- Generic tools could become unsafe in a business product.
- Auto-approval features are risky until policy, coverage, and permission checks are deterministic.
- Pori Cloud uses generic user memory; Moshomo needs company/team/employee-aware memory.

## Current Conclusion

Pori is a strong prototype framework. Moshomo AI should borrow its engine ideas, not its product identity.

The valuable core is structured agent loop, tool registry, memory contracts, conversation/run persistence, traces, evals, and guardrails.

The rebuild must center company tenancy, workforce permissions, Moshomo-native tools, policy-gated actions, and auditable AI decisions.
