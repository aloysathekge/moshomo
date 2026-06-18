from __future__ import annotations

from typing import Any


def clean_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Normalize a Pydantic JSON Schema for provider tool definitions.

    Strips Pydantic-only annotations (``title``) that some providers reject,
    while preserving structure (type/properties/required/enum/items/anyOf).
    """
    return _strip(schema)  # type: ignore[return-value]


def _strip(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _strip(item) for key, item in value.items() if key != "title"}
    if isinstance(value, list):
        return [_strip(item) for item in value]
    return value
