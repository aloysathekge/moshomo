"""App entitlement checks.

Effective access to a sellable app = its ``company_apps`` row if present, else the
catalog default. Core (non-sellable) apps are always enabled. Reads degrade
gracefully (treat as enabled) when the ``company_apps`` table is not yet applied,
so gating can ship before the migration without breaking existing orgs.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from moshomo_api.catalog import default_enabled, is_sellable
from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client


async def fetch_entitlements(
    client: SupabaseRestClient, actor: ActorContext
) -> dict[str, bool]:
    try:
        rows = await client.select(
            "company_apps",
            access_token=actor.access_token,
            params={"select": "app_key,enabled", "company_id": f"eq.{actor.company_id}"},
        )
    except Exception:
        return {}
    return {row["app_key"]: bool(row["enabled"]) for row in rows}


def effective_enabled(app_key: str, rows: dict[str, bool]) -> bool:
    if not is_sellable(app_key):
        return True
    if app_key in rows:
        return rows[app_key]
    return default_enabled(app_key)


async def is_app_enabled(
    client: SupabaseRestClient, actor: ActorContext, app_key: str
) -> bool:
    if not is_sellable(app_key):
        return True
    return effective_enabled(app_key, await fetch_entitlements(client, actor))


def require_app_enabled(app_key: str):
    """A router/route dependency that 403s when the app is not entitled."""

    async def dependency(
        actor: ActorContext = Depends(get_actor_context),
        client: SupabaseRestClient = Depends(get_supabase_rest_client),
    ) -> None:
        if await is_app_enabled(client, actor, app_key):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"The {app_key} app is not enabled for your organization",
        )

    return dependency
