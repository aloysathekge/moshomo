from __future__ import annotations

from typing import Any

from anthropic import AsyncAnthropic

from moshomo_ai.llm.base import (
    LLMMessage,
    LLMStep,
    LLMUsage,
    StopReason,
    ToolCall,
    ToolSpec,
)
from moshomo_ai.llm.schema import clean_schema


class AnthropicClient:
    provider = "anthropic"

    def __init__(self, *, api_key: str, model: str, max_tokens: int, timeout: float) -> None:
        self.model = model
        self._max_tokens = max_tokens
        self._client = AsyncAnthropic(api_key=api_key, timeout=timeout)

    async def step(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
    ) -> LLMStep:
        response = await self._client.messages.create(
            model=self.model,
            max_tokens=self._max_tokens,
            system=system,
            messages=_to_messages(messages),
            tools=[
                {
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": clean_schema(tool.parameters),
                }
                for tool in tools
            ],
            tool_choice={"type": "auto"},
        )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=dict(block.input or {}))
                )

        stop_reason: StopReason
        if tool_calls:
            stop_reason = "tool_use"
        elif response.stop_reason == "refusal":
            stop_reason = "refusal"
        else:
            stop_reason = "end_turn"

        return LLMStep(
            text="\n".join(text_parts).strip() or None,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            usage=LLMUsage(
                provider=self.provider,
                model=self.model,
                input_tokens=getattr(response.usage, "input_tokens", 0),
                output_tokens=getattr(response.usage, "output_tokens", 0),
            ),
        )


def _to_messages(messages: list[LLMMessage]) -> list[dict[str, Any]]:
    """Translate the normalized transcript into Anthropic message blocks.

    Consecutive tool results are merged into a single user turn so the
    user/assistant alternation stays valid.
    """
    result: list[dict[str, Any]] = []
    pending_tool_results: list[dict[str, Any]] = []

    def flush_tool_results() -> None:
        nonlocal pending_tool_results
        if pending_tool_results:
            result.append({"role": "user", "content": pending_tool_results})
            pending_tool_results = []

    for message in messages:
        if message.role == "tool":
            pending_tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id or "",
                    "content": message.text or "",
                    "is_error": message.is_error,
                }
            )
            continue

        flush_tool_results()
        if message.role == "user":
            result.append(
                {"role": "user", "content": [{"type": "text", "text": message.text or ""}]}
            )
        else:  # assistant
            content: list[dict[str, Any]] = []
            if message.text:
                content.append({"type": "text", "text": message.text})
            for call in message.tool_calls:
                content.append(
                    {
                        "type": "tool_use",
                        "id": call.id,
                        "name": call.name,
                        "input": call.arguments,
                    }
                )
            result.append({"role": "assistant", "content": content})

    flush_tool_results()
    return result
