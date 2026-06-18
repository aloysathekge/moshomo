from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

Role = Literal["user", "assistant", "tool"]
StopReason = Literal["tool_use", "end_turn", "refusal", "max_steps", "error"]


@dataclass(frozen=True)
class ToolSpec:
    """Provider-neutral tool definition. `parameters` is a JSON Schema object."""

    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMMessage:
    """One normalized transcript entry, translated per-provider by each client."""

    role: Role
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    # Populated only for role == "tool":
    tool_call_id: str | None = None
    name: str | None = None
    is_error: bool = False


@dataclass(frozen=True)
class LLMUsage:
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True)
class LLMStep:
    text: str | None
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    usage: LLMUsage
    reasoning: str | None = None


@runtime_checkable
class LLMClient(Protocol):
    """A single round-trip to a provider, normalized across vendors."""

    provider: str
    model: str

    async def step(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        tools: list[ToolSpec],
    ) -> LLMStep: ...
