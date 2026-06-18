from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from moshomo_api.context import ActorContext
from moshomo_api.supabase import SupabaseRestClient


@dataclass
class RunContext:
    """Per-run execution context handed to every tool.

    Tools read company/workforce data through ``rest`` using the actor's own
    access token, so Supabase RLS — not the tool — decides what is visible.
    """

    actor: ActorContext
    rest: SupabaseRestClient
    request_source: str = "api"
    citations: list[dict[str, Any]] = field(default_factory=list)

    @property
    def access_token(self) -> str:
        return self.actor.access_token

    @property
    def company_id(self) -> str:
        return str(self.actor.company_id)

    def cite(self, table: str, record_id: str, title: str | None = None) -> None:
        entry: dict[str, Any] = {"table": table, "id": str(record_id)}
        if title:
            entry["title"] = title
        if entry not in self.citations:
            self.citations.append(entry)
