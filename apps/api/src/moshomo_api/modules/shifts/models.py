from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ShiftStatus = Literal["scheduled", "cancelled"]


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    start_time: time
    end_time: time
    color: str | None = Field(default=None, max_length=20)


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    start_time: time | None = None
    end_time: time | None = None
    color: str | None = None


class TemplateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    company_id: UUID
    name: str
    start_time: time
    end_time: time
    color: str | None = None
    created_at: datetime
    updated_at: datetime


class EmployeeBrief(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str | None = None
    last_name: str | None = None
    manager_employee_id: UUID | None = None


class TemplateBrief(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None


class AssignmentCreate(BaseModel):
    template_id: UUID
    shift_date: date
    employee_id: UUID | None = None
    start_time: time | None = None
    end_time: time | None = None
    notes: str | None = Field(default=None, max_length=500)


class AssignmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: UUID | None = None
    shift_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    status: ShiftStatus | None = None
    notes: str | None = None


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    company_id: UUID
    template_id: UUID
    employee_id: UUID | None = None
    shift_date: date
    start_time: time
    end_time: time
    status: ShiftStatus
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    employee: EmployeeBrief | None = None
    template: TemplateBrief | None = None


class AvailabilityWindow(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time


class AvailabilitySet(BaseModel):
    windows: list[AvailabilityWindow]


class AvailabilityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    employee_id: UUID
    weekday: int
    start_time: time
    end_time: time
