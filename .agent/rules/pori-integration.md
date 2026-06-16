# Pori Integration

Pori is the intelligence layer for Moshomo. It should assist with workforce questions, leave interpretation, schedule generation, shift gap detection, and replacement suggestions.

## Rules

- Pori recommendations must be grounded in documented workforce data: employees, roles, leave, availability, shifts, permissions, and policy rules.
- Do not let Pori directly mutate critical records without an approval path or explicit auto-approval rule.
- Natural-language actions must produce structured intent before changing application state.
- Auto-approval behavior must explain which rules were satisfied.
- If Pori needs external memory, tools, or retrieval, document the source of truth and verification path before implementation.
