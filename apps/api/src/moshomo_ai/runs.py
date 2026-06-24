from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from moshomo_api.config import settings
from moshomo_api.context import ActorContext
from moshomo_api.supabase import SupabaseRestClient
from moshomo_ai.agent import run_agent
from moshomo_ai.context import RunContext
from moshomo_ai.llm.base import LLMClient, LLMMessage
from moshomo_ai.prompts import workforce_assistant_prompt
from moshomo_ai.tools import workforce_registry


def _to_prior_messages(
    history: list[dict[str, str]] | None,
) -> list[LLMMessage]:
    """Convert plain {role, content} turns from the client into transcript
    messages. Only user/assistant text turns are carried; tool calls are not
    replayed (the model re-runs tools as needed against live data)."""
    messages: list[LLMMessage] = []
    for turn in history or []:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append(LLMMessage(role=role, text=content))
    return messages


async def run_workforce_assistant(
    *,
    question: str,
    actor: ActorContext,
    rest: SupabaseRestClient,
    client: LLMClient,
    request_source: str = "api",
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    context = RunContext(actor=actor, rest=rest, request_source=request_source)
    result = await run_agent(
        client=client,
        registry=workforce_registry,
        context=context,
        system=workforce_assistant_prompt(),
        question=question,
        max_steps=settings.moshomo_ai_max_steps,
        prior_messages=_to_prior_messages(history),
    )

    run = await rest.insert(
        "assistant_runs",
        access_token=actor.access_token,
        values={
            "company_id": str(actor.company_id),
            "actor_user_id": str(actor.user_id),
            "request_source": request_source,
            "status": result.status,
            "provider": client.provider,
            "model": client.model,
            "input": question,
            "intent": context.proposed_intent,
            "tool_calls": result.tool_calls,
            "cited_records": context.citations,
            "affected_records": [],
            "final_answer": result.answer,
            "reasoning_summary": result.reasoning_summary,
            "refusal_reason": result.refusal_reason,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {
        "run_id": run.get("id"),
        "status": result.status,
        "answer": result.answer,
        "refusal_reason": result.refusal_reason,
        "citations": context.citations,
        "proposed_intent": context.proposed_intent,
        "provider": client.provider,
        "model": client.model,
    }
