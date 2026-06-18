"""Read-only workforce tools for Moshomo AI.

Importing this package registers the default tool set on ``workforce_registry``.
The registry is the boundary: only read-only tools are registered, so the model
has no write path.
"""

from moshomo_ai.tools.registry import ToolRegistry, workforce_registry
from moshomo_ai.tools import workforce as _workforce  # noqa: F401  (registers tools)

__all__ = ["ToolRegistry", "workforce_registry"]
