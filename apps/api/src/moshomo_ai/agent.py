from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from moshomo_ai.context import RunContext
from moshomo_ai.llm.base import LLMClient, LLMMessage
from moshomo_ai.tools.registry import ToolRegistry

RunStatus = Literal["completed", "failed", "refused"]


@dataclass
class AgentResult:
    status: RunStatus
    answer: str | None
    refusal_reason: str | None = None
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    reasoning_summary: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


async def run_agent(
    *,
    client: LLMClient,
    registry: ToolRegistry,
    context: RunContext,
    system: str,
    question: str,
    max_steps: int,
    prior_messages: list[LLMMessage] | None = None,
) -> AgentResult:
    # Prior turns (if any) give the model conversation context so follow-ups like
    # "approve it" resolve against what was just discussed.
    history: list[LLMMessage] = [
        *(prior_messages or []),
        LLMMessage(role="user", text=question),
    ]
    specs = registry.specs()
    result = AgentResult(status="failed", answer=None)

    for _ in range(max_steps):
        step = await client.step(system=system, messages=history, tools=specs)
        result.input_tokens += step.usage.input_tokens
        result.output_tokens += step.usage.output_tokens

        if step.stop_reason == "refusal":
            result.status = "refused"
            result.refusal_reason = step.text or "The assistant declined to answer."
            return result

        if step.tool_calls:
            history.append(
                LLMMessage(role="assistant", text=step.text, tool_calls=step.tool_calls)
            )
            for call in step.tool_calls:
                tool_result = await registry.execute(call.name, call.arguments, context)
                result.tool_calls.append(
                    {"name": call.name, "arguments": call.arguments, "ok": tool_result.ok}
                )
                history.append(
                    LLMMessage(
                        role="tool",
                        tool_call_id=call.id,
                        name=call.name,
                        text=json.dumps(tool_result.content, default=str),
                        is_error=not tool_result.ok,
                    )
                )
            continue

        # No tool calls -> final answer.
        result.status = "completed"
        result.answer = step.text
        result.reasoning_summary = step.reasoning
        return result

    # Step budget exhausted while still calling tools.
    result.status = "failed"
    result.answer = "I couldn't finish answering within the allowed number of steps."
    return result
