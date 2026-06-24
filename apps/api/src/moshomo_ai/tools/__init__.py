"""Workforce tools for Moshomo AI.

Importing this package registers the default tool set on ``workforce_registry``.
Tools are either read-only or **propose-only**: a propose-only tool stages a
structured intent for the user to confirm but never writes. The model therefore
has no direct write path; all changes go through the normal API after a human
confirmation.
"""

from moshomo_ai.tools.registry import ToolRegistry, workforce_registry
from moshomo_ai.tools import workforce as _workforce  # noqa: F401  (registers tools)
from moshomo_ai.tools import leave as _leave  # noqa: F401  (registers tools)

__all__ = ["ToolRegistry", "workforce_registry"]
