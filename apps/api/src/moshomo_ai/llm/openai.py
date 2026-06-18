from __future__ import annotations

import json
from typing import Any

from openai import AsyncOpenAI

from moshomo_ai.llm.base import (
    LLMMessage,
    LLMStep,
    LLMUsage,
    StopReason,
    ToolCall,
    ToolSpec,
)
from moshomo_ai.llm.schema import clean_schema


class OpenAIClient:
    provider = "openai"

    def __init__(self, *, api_key: str, model: str, max_tokens: int, timeout: float) -> None:
        self.model = model
        self._max_tokens = max_tokens
        self._client = AsyncOpenAI(api_key=api_key, timeout=timeout)

    async def step(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
    ) -> LLMStep:
        response = await self._client.chat.completions.create(
            model=self.model,
            max_completion_tokens=self._max_tokens,
            messages=[{"role": "system", "content": system}, *_to_messages(messages)],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": clean_schema(tool.parameters),
                    },
                }
                for tool in tools
            ],
            tool_choice="auto",
        )

        choice = response.choices[0]
        message = choice.message
        tool_calls: list[ToolCall] = []
        for call in message.tool_calls or []:
            if call.type != "function":
                continue
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}
            tool_calls.append(ToolCall(id=call.id, name=call.function.name, arguments=arguments))

        stop_reason: StopReason = "tool_use" if tool_calls else "end_turn"
        usage = response.usage
        return LLMStep(
            text=(message.content or None) if not tool_calls else (message.content or None),
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            usage=LLMUsage(
                provider=self.provider,
                model=self.model,
                input_tokens=getattr(usage, "prompt_tokens", 0) if usage else 0,
                output_tokens=getattr(usage, "completion_tokens", 0) if usage else 0,
            ),
        )


def _to_messages(messages: list[LLMMessage]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "user":
            result.append({"role": "user", "content": message.text or ""})
        elif message.role == "tool":
            result.append(
                {
                    "role": "tool",
                    "tool_call_id": message.tool_call_id or "",
                    "content": message.text or "",
                }
            )
        else:  # assistant
            entry: dict[str, Any] = {"role": "assistant", "content": message.text or None}
            if message.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.arguments),
                        },
                    }
                    for call in message.tool_calls
                ]
            result.append(entry)
    return result
