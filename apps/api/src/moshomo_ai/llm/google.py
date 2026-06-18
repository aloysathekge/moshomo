from __future__ import annotations

from google import genai
from google.genai import types

from moshomo_ai.llm.base import (
    LLMMessage,
    LLMStep,
    LLMUsage,
    StopReason,
    ToolCall,
    ToolSpec,
)
from moshomo_ai.llm.schema import clean_schema


class GoogleClient:
    provider = "google"

    def __init__(self, *, api_key: str, model: str, max_tokens: int, timeout: float) -> None:
        self.model = model
        self._max_tokens = max_tokens
        self._client = genai.Client(api_key=api_key)

    async def step(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
    ) -> LLMStep:
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=self._max_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=tool.name,
                            description=tool.description,
                            parameters_json_schema=clean_schema(tool.parameters),
                        )
                        for tool in tools
                    ]
                )
            ],
        )

        response = await self._client.aio.models.generate_content(
            model=self.model,
            contents=_to_contents(messages),
            config=config,
        )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        candidates = response.candidates or []
        if candidates and candidates[0].content and candidates[0].content.parts:
            for index, part in enumerate(candidates[0].content.parts):
                if getattr(part, "function_call", None):
                    call = part.function_call
                    tool_calls.append(
                        ToolCall(
                            id=getattr(call, "id", None) or f"{call.name}_{index}",
                            name=call.name or "",
                            arguments=dict(call.args or {}),
                        )
                    )
                elif getattr(part, "text", None):
                    text_parts.append(part.text)

        stop_reason: StopReason = "tool_use" if tool_calls else "end_turn"
        usage = response.usage_metadata
        return LLMStep(
            text="\n".join(text_parts).strip() or None,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            usage=LLMUsage(
                provider=self.provider,
                model=self.model,
                input_tokens=getattr(usage, "prompt_token_count", 0) or 0 if usage else 0,
                output_tokens=getattr(usage, "candidates_token_count", 0) or 0 if usage else 0,
            ),
        )


def _to_contents(messages: list[LLMMessage]) -> list[types.Content]:
    contents: list[types.Content] = []
    pending_tool_parts: list[types.Part] = []

    def flush_tool_parts() -> None:
        nonlocal pending_tool_parts
        if pending_tool_parts:
            contents.append(types.Content(role="user", parts=pending_tool_parts))
            pending_tool_parts = []

    for message in messages:
        if message.role == "tool":
            pending_tool_parts.append(
                types.Part.from_function_response(
                    name=message.name or "",
                    response={"result": message.text or ""},
                )
            )
            continue

        flush_tool_parts()
        if message.role == "user":
            contents.append(
                types.Content(role="user", parts=[types.Part.from_text(text=message.text or "")])
            )
        else:  # assistant -> "model"
            parts: list[types.Part] = []
            if message.text:
                parts.append(types.Part.from_text(text=message.text))
            for call in message.tool_calls:
                parts.append(
                    types.Part(
                        function_call=types.FunctionCall(name=call.name, args=call.arguments)
                    )
                )
            contents.append(types.Content(role="model", parts=parts))

    flush_tool_parts()
    return contents
