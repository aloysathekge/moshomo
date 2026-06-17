from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from moshomo_api.auth import AuthenticatedUser, get_current_user
from moshomo_api.supabase import SupabaseRestClient, get_supabase_rest_client

MoshomoRole = Literal["admin", "manager", "employee"]


@dataclass(frozen=True)
class ActorContext:
    company_id: UUID
    user_id: UUID
    role: MoshomoRole
    employee_id: UUID | None
    access_token: str = field(repr=False)


async def get_actor_context(
    active_company_id: UUID = Header(alias="X-Company-ID"),
    user: AuthenticatedUser = Depends(get_current_user),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> ActorContext:
    memberships = await client.select(
        "company_memberships",
        access_token=user.access_token,
        params={
            "select": "company_id,user_id,role,status",
            "company_id": f"eq.{active_company_id}",
            "user_id": f"eq.{user.id}",
            "status": "eq.active",
            "limit": 1,
        },
    )
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active membership exists for this company",
        )

    role = memberships[0].get("role")
    if role not in {"admin", "manager", "employee"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company membership has an unsupported role",
        )

    employees = await client.select(
        "employees",
        access_token=user.access_token,
        params={
            "select": "id",
            "company_id": f"eq.{active_company_id}",
            "profile_id": f"eq.{user.id}",
            "limit": 1,
        },
    )
    employee_id = UUID(employees[0]["id"]) if employees else None

    return ActorContext(
        company_id=active_company_id,
        user_id=user.id,
        role=role,
        employee_id=employee_id,
        access_token=user.access_token,
    )
