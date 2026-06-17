from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from moshomo_api.auth import AuthenticatedUser, get_current_user
from moshomo_api.context import ActorContext, get_actor_context
from moshomo_api.supabase import (
    SupabaseAdminAuthClient,
    SupabaseRestClient,
    get_supabase_admin_auth_client,
    get_supabase_rest_client,
)

router = APIRouter(tags=["onboarding"])
CompanyRole = Literal["admin", "manager", "employee"]


class CompanyBootstrapRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    company_slug: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    employee_number: str = Field(min_length=1, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    job_title: str | None = Field(default=None, max_length=120)


class CompanyBootstrapResponse(BaseModel):
    company_id: UUID
    employee_id: UUID
    membership_id: UUID
    role: Literal["admin"]


class DepartmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class DepartmentResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


class EmployeeInvitationRequest(BaseModel):
    email: EmailStr
    role: CompanyRole = "employee"
    employee_number: str = Field(min_length=1, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    department_id: UUID | None = None
    manager_employee_id: UUID | None = None
    job_title: str | None = Field(default=None, max_length=120)
    employment_type: str | None = Field(default=None, max_length=80)
    start_date: date | None = None


class EmployeeInvitationResponse(BaseModel):
    invitation_id: UUID
    employee_id: UUID
    company_id: UUID
    email: EmailStr
    role: CompanyRole
    status: Literal["sent"]
    expires_at: datetime


class InvitationAcceptanceResponse(BaseModel):
    company_id: UUID
    employee_id: UUID
    membership_id: UUID
    role: CompanyRole
    status: Literal["accepted"]


def _require_company_admin(actor: ActorContext, company_id: UUID) -> None:
    if actor.company_id != company_id or actor.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company admin access is required",
        )


@router.post(
    "/companies",
    response_model=CompanyBootstrapResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bootstrap_company(
    payload: CompanyBootstrapRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> CompanyBootstrapResponse:
    result = await client.rpc(
        "bootstrap_company",
        access_token=user.access_token,
        arguments=payload.model_dump(),
    )
    return CompanyBootstrapResponse.model_validate(result)


@router.post(
    "/companies/{company_id}/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_department(
    company_id: UUID,
    payload: DepartmentCreateRequest,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> DepartmentResponse:
    _require_company_admin(actor, company_id)
    result = await client.insert(
        "departments",
        access_token=actor.access_token,
        values={"company_id": str(company_id), "name": payload.name.strip()},
    )
    return DepartmentResponse.model_validate(result)


@router.post(
    "/companies/{company_id}/invitations",
    response_model=EmployeeInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_employee(
    company_id: UUID,
    payload: EmployeeInvitationRequest,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
    admin_auth: SupabaseAdminAuthClient = Depends(get_supabase_admin_auth_client),
) -> EmployeeInvitationResponse:
    _require_company_admin(actor, company_id)
    admin_auth.require_configuration()

    result = await client.rpc(
        "create_employee_invitation",
        access_token=actor.access_token,
        arguments={
            "target_company_id": str(company_id),
            "invite_email": str(payload.email).lower(),
            "assigned_role": payload.role,
            "employee_number": payload.employee_number,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "department_id": str(payload.department_id) if payload.department_id else None,
            "manager_employee_id": (
                str(payload.manager_employee_id) if payload.manager_employee_id else None
            ),
            "job_title": payload.job_title,
            "employment_type": payload.employment_type,
            "start_date": payload.start_date.isoformat() if payload.start_date else None,
        },
    )

    try:
        await admin_auth.invite_user_by_email(
            result["email"],
            invitation_id=result["invitation_id"],
            company_id=result["company_id"],
        )
    except HTTPException:
        await client.update(
            "company_invitations",
            access_token=actor.access_token,
            filters={"id": f"eq.{result['invitation_id']}"},
            values={"status": "failed"},
        )
        raise

    updated = await client.update(
        "company_invitations",
        access_token=actor.access_token,
        filters={"id": f"eq.{result['invitation_id']}"},
        values={"status": "sent"},
    )
    if len(updated) != 1:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invitation was sent but its status could not be recorded",
        )
    result["status"] = "sent"
    return EmployeeInvitationResponse.model_validate(result)


@router.post(
    "/companies/{company_id}/invitations/{invitation_id}/resend",
    response_model=EmployeeInvitationResponse,
)
async def resend_employee_invitation(
    company_id: UUID,
    invitation_id: UUID,
    actor: ActorContext = Depends(get_actor_context),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
    admin_auth: SupabaseAdminAuthClient = Depends(get_supabase_admin_auth_client),
) -> EmployeeInvitationResponse:
    _require_company_admin(actor, company_id)
    admin_auth.require_configuration()

    rows = await client.select(
        "company_invitations",
        access_token=actor.access_token,
        params={
            "select": "id,employee_id,company_id,email,role,status,expires_at",
            "id": f"eq.{invitation_id}",
            "company_id": f"eq.{company_id}",
            "status": "in.(pending,failed)",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A resendable invitation was not found",
        )

    invitation = rows[0]
    await admin_auth.invite_user_by_email(
        invitation["email"],
        invitation_id=str(invitation["id"]),
        company_id=str(invitation["company_id"]),
    )
    updated = await client.update(
        "company_invitations",
        access_token=actor.access_token,
        filters={"id": f"eq.{invitation_id}"},
        values={"status": "sent"},
    )
    if len(updated) != 1:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invitation was sent but its status could not be recorded",
        )

    invitation["invitation_id"] = invitation.pop("id")
    invitation["status"] = "sent"
    return EmployeeInvitationResponse.model_validate(invitation)


@router.post(
    "/company-invitations/{invitation_id}/accept",
    response_model=InvitationAcceptanceResponse,
)
async def accept_invitation(
    invitation_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    client: SupabaseRestClient = Depends(get_supabase_rest_client),
) -> InvitationAcceptanceResponse:
    result = await client.rpc(
        "accept_company_invitation",
        access_token=user.access_token,
        arguments={"invitation_id": str(invitation_id)},
    )
    return InvitationAcceptanceResponse.model_validate(result)
