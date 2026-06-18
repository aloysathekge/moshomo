from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, ValidationError

from moshomo_ai.context import RunContext
from moshomo_ai.llm.base import ToolSpec

ToolFn = Callable[[BaseModel, RunContext], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class RegisteredTool:
    name: str
    description: str
    param_model: type[BaseModel]
    fn: ToolFn


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    content: dict[str, Any]


class ToolRegistry:
    """Pydantic-validated read-only tool registry (modeled on Pori's registry)."""

    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(
        self, *, name: str, description: str, param_model: type[BaseModel]
    ) -> Callable[[ToolFn], ToolFn]:
        def decorator(fn: ToolFn) -> ToolFn:
            self._tools[name] = RegisteredTool(name, description, param_model, fn)
            return fn

        return decorator

    def names(self) -> list[str]:
        return list(self._tools)

    def specs(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name=tool.name,
                description=tool.description,
                parameters=tool.param_model.model_json_schema(),
            )
            for tool in self._tools.values()
        ]

    async def execute(
        self, name: str, arguments: dict[str, Any], context: RunContext
    ) -> ToolResult:
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult(ok=False, content={"error": f"Unknown tool '{name}'"})
        try:
            params = tool.param_model.model_validate(arguments or {})
        except ValidationError as error:
            return ToolResult(ok=False, content={"error": f"Invalid arguments: {error.errors()}"})
        try:
            result = await tool.fn(params, context)
        except Exception as error:  # tools must never crash the run loop
            return ToolResult(ok=False, content={"error": str(error)})
        return ToolResult(ok=True, content=result)


workforce_registry = ToolRegistry()
