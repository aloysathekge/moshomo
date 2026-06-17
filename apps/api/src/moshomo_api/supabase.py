from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from moshomo_api.config import Settings, settings


class SupabaseRestClient:
    def __init__(self, app_settings: Settings) -> None:
        self._settings = app_settings

    def _configuration(self) -> tuple[str, str]:
        if (
            self._settings.supabase_url is None
            or self._settings.supabase_publishable_key is None
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase data access is not configured",
            )
        return (
            str(self._settings.supabase_url).rstrip("/"),
            self._settings.supabase_publishable_key.get_secret_value(),
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        access_token: str,
        params: dict[str, str | int] | None = None,
        json: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> Any:
        base_url, publishable_key = self._configuration()
        headers = {
            "apikey": publishable_key,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }
        if prefer is not None:
            headers["Prefer"] = prefer
        try:
            async with httpx.AsyncClient(
                base_url=f"{base_url}/rest/v1",
                headers=headers,
                timeout=self._settings.supabase_http_timeout_seconds,
            ) as client:
                response = await client.request(
                    method,
                    path,
                    params=params,
                    json=json,
                )
                response.raise_for_status()
                payload = response.json() if response.content else None
        except httpx.HTTPStatusError as error:
            upstream_status = error.response.status_code
            if upstream_status in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Supabase denied access to the requested records",
                ) from error
            if upstream_status == status.HTTP_409_CONFLICT:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The requested record conflicts with existing data",
                ) from error
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase data request failed",
            ) from error
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase data service is unavailable",
            ) from error

        return payload

    async def select(
        self,
        table: str,
        *,
        access_token: str,
        params: dict[str, str | int],
    ) -> list[dict[str, Any]]:
        payload = await self._request(
            "GET",
            f"/{table}",
            access_token=access_token,
            params=params,
        )

        if not isinstance(payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase returned an unexpected response",
            )
        return payload

    async def insert(
        self,
        table: str,
        *,
        access_token: str,
        values: dict[str, Any],
    ) -> dict[str, Any]:
        payload = await self._request(
            "POST",
            f"/{table}",
            access_token=access_token,
            json=values,
            prefer="return=representation",
        )
        if not isinstance(payload, list) or len(payload) != 1:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase returned an unexpected insert response",
            )
        return payload[0]

    async def update(
        self,
        table: str,
        *,
        access_token: str,
        filters: dict[str, str | int],
        values: dict[str, Any],
    ) -> list[dict[str, Any]]:
        payload = await self._request(
            "PATCH",
            f"/{table}",
            access_token=access_token,
            params=filters,
            json=values,
            prefer="return=representation",
        )
        if not isinstance(payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase returned an unexpected update response",
            )
        return payload

    async def rpc(
        self,
        function_name: str,
        *,
        access_token: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        payload = await self._request(
            "POST",
            f"/rpc/{function_name}",
            access_token=access_token,
            json=arguments,
        )
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase returned an unexpected RPC response",
            )
        return payload


class SupabaseAdminAuthClient:
    def __init__(self, app_settings: Settings) -> None:
        self._settings = app_settings

    def require_configuration(self) -> tuple[str, str]:
        if self._settings.supabase_url is None or self._settings.supabase_secret_key is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase invitation delivery is not configured",
            )
        return (
            str(self._settings.supabase_url).rstrip("/"),
            self._settings.supabase_secret_key.get_secret_value(),
        )

    async def invite_user_by_email(
        self,
        email: str,
        *,
        invitation_id: str,
        company_id: str,
    ) -> None:
        base_url, secret_key = self.require_configuration()
        headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(
                timeout=self._settings.supabase_http_timeout_seconds
            ) as client:
                response = await client.post(
                    f"{base_url}/auth/v1/invite",
                    params={
                        "redirect_to": str(self._settings.supabase_invite_redirect_url)
                    },
                    headers=headers,
                    json={
                        "email": email,
                        "data": {
                            "moshomo_invitation_id": invitation_id,
                            "moshomo_company_id": company_id,
                        },
                    },
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            if error.response.status_code in {400, 409, 422}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Supabase could not create this user invitation",
                ) from error
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase invitation delivery failed",
            ) from error
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase invitation service is unavailable",
            ) from error


supabase_rest_client = SupabaseRestClient(settings)
supabase_admin_auth_client = SupabaseAdminAuthClient(settings)


def get_supabase_rest_client() -> SupabaseRestClient:
    return supabase_rest_client


def get_supabase_admin_auth_client() -> SupabaseAdminAuthClient:
    return supabase_admin_auth_client
