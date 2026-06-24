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
    # A single structured action the assistant has staged for the user to
    # confirm. Tools never write; they stage an intent here and the human's
    # explicit confirmation drives the actual write through the normal API.
    proposed_intent: dict[str, Any] | None = None

    @property
    def access_token(self) -> str:
        return self.actor.access_token

    @property
    def company_id(self) -> str:
        return str(self.actor.company_id)

    def cite(self, table: str, record_id: str, title: str | None = None) -> None:
        record_id = str(record_id)
        # Dedupe by record identity (table + id), not the full entry — the same
        # record cited with different titles must not appear twice.
        if any(c["table"] == table and c["id"] == record_id for c in self.citations):
            return
        entry: dict[str, Any] = {"table": table, "id": record_id}
        if title:
            entry["title"] = title
        self.citations.append(entry)

    def propose(self, intent: dict[str, Any]) -> None:
        """Stage an action for the user to confirm. One intent per run."""
        self.proposed_intent = intent
