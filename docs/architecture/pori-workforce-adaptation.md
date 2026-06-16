# Pori To Moshomo AI Adaptation

Moshomo will not use Pori as a long-term generic dependency.

Pori is source material. We will evaluate it, copy the useful engine ideas, strip generic/product-specific parts, and rebuild a native Moshomo AI layer for workforce operations.

## Useful Pori Patterns

- Core agent package: `Pori/Pori`.
- Hosted service pattern: `Pori/pori_cloud`.
- Memory, tools, orchestration, and streaming routes are already established in Pori.

## Moshomo AI Boundary

The Moshomo API owns workforce state, permissions, company tenancy, Supabase access, and policy validation. Moshomo AI should assist through explicit tools and structured intents.

Initial adapter location:

- `apps/api/src/moshomo_api/pori_adapter.py`

This file is only a temporary placeholder. The real direction is a native `moshomo_ai` module after Pori has been stripped and redesigned.

## Rules

- Moshomo AI can suggest, explain, extract intent, and generate draft schedules.
- Moshomo must validate permissions, policy, leave balances, coverage, and fairness before mutating records.
- Auto-approval must record which rules passed.
- Do not connect AI tools to Supabase writes until the tool contracts, permission checks, and policy gates are documented.

## Evaluation

See `docs/architecture/pori-to-moshomo-ai-evaluation.md`.
