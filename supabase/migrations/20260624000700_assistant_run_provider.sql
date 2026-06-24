-- Persist which LLM provider/model answered each Moshomo AI run.
-- The API already returns these in the response but had nowhere to record them,
-- so a past run's audit row could not tell you which model produced the answer.
-- Nullable: pre-existing rows (and any failure before a client is resolved)
-- legitimately have no provider/model.

alter table public.assistant_runs
  add column if not exists provider text,
  add column if not exists model text;

comment on column public.assistant_runs.provider is
  'LLM provider that executed this run (e.g. anthropic, openai, google).';
comment on column public.assistant_runs.model is
  'LLM model id that executed this run (e.g. claude-sonnet-4-6).';
