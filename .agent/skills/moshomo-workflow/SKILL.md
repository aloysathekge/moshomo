---
name: moshomo-workflow
description: Work safely on Moshomo using the PRD, monorepo boundaries, workforce-domain rules, and Aloy progress tracking.
---

# Moshomo Workflow

Use this skill for tasks inside `Moshomo/moshomo`.

## Must Read First

- `Moshomo/moshomo/AGENTS.md`
- `Moshomo/moshomo/PRD.txt`
- `Moshomo/moshomo/.agent/agent.json`
- `Moshomo/moshomo/.agent/rules/repo-safety.md`
- `Moshomo/moshomo/.agent/rules/source-of-truth.md`
- `Moshomo/moshomo/.agent/rules/verification.md`
- `Moshomo/moshomo/.agent/rules/product-boundaries.md`
- `Moshomo/moshomo/.agent/rules/monorepo-architecture.md`
- `Moshomo/moshomo/.agent/rules/pori-integration.md`
- `Moshomo/moshomo/.agent/rules/progress-tracking.md`

## Workflow

1. Classify the task by area: app, backend, data, docs, integrations, deployment, or generated assets.
2. Read the smallest relevant file set before editing.
3. Check whether the task affects V1 product scope, monorepo shape, or Pori integration.
4. Preserve source-of-truth boundaries.
5. Apply the safe verification path in `.agent/rules/verification.md`.
6. Apply the progress update triggers in `.agent/rules/progress-tracking.md`.
7. Report skipped checks, approval-gated actions, and remaining risks.

## Approval Required

secrets, credentials, deployment, production-impacting changes

## Output

Report files changed, verification commands run, skipped checks, and assumptions.
