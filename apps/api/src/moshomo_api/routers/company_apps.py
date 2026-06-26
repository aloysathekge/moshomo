from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from moshomo_api.catalog import APP_CATALOG, CURRENCY, SELLABLE_KEYS, is_sellable
from moshomo_api.context import ActorContext, get_actor_context, require_company_admin
from moshomo_api.entitlements import effective_enabled, fetch_entitlements
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

router = APIRouter(prefix="/companies", tags=["apps"])


class AppToggle(BaseModel):
    enabled: bool


def _assert_same_company(actor: ActorContext, company_id: UUID) -> None:
    if str(company_id) != str(actor.company_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company mismatch for this request",
        )


@router.get("/{company_id}/apps")
async def list_company_apps(
    company_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    _assert_same_company(actor, company_id)
    rows = await fetch_entitlements(client, actor)
    apps = [{"key": key, "enabled": effective_enabled(key, rows)} for key in sorted(SELLABLE_KEYS)]
    return {"apps": apps}


@router.get("/{company_id}/plan")
async def company_plan(
    company_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    require_company_admin(actor, company_id)
    rows = await fetch_entitlements(client, actor)
    active_rows = await client.select(
        "employees",
        access_token=actor.access_token,
        params={"select": "id", "company_id": f"eq.{actor.company_id}", "status": "eq.active"},
    )
    active = len(active_rows)

    apps: list[dict[str, Any]] = []
    total = 0
    for app in APP_CATALOG:
        if not app["sellable"]:
            continue
        enabled = effective_enabled(app["key"], rows)
        monthly = app["price_cents"] * active if enabled else 0
        total += monthly
        apps.append(
            {
                "key": app["key"],
                "name": app["name"],
                "description": app["description"],
                "price_cents": app["price_cents"],
                "unit": app["unit"],
                "enabled": enabled,
                "monthly_cents": monthly,
            }
        )
    return {
        "currency": CURRENCY,
        "active_employees": active,
        "monthly_total_cents": total,
        "apps": apps,
    }


@router.patch("/{company_id}/apps/{app_key}")
async def set_company_app(
    company_id: UUID,
    app_key: str,
    payload: AppToggle,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> dict[str, Any]:
    require_company_admin(actor, company_id)
    if not is_sellable(app_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{app_key}' is not a subscribable app",
        )
    await client.upsert(
        "company_apps",
        access_token=actor.access_token,
        values=[
            {
                "company_id": str(actor.company_id),
                "app_key": app_key,
                "enabled": payload.enabled,
                "granted_by": str(actor.user_id),
            }
        ],
        on_conflict="company_id,app_key",
    )
    return {"app": {"key": app_key, "enabled": payload.enabled}}
