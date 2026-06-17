from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from time import monotonic
from typing import Any, Mapping
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from moshomo_api.config import Settings, settings


class JWTValidationError(ValueError):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    email: str | None
    access_token: str = field(repr=False)
    claims: Mapping[str, Any] = field(repr=False)


class SupabaseJWTVerifier:
    def __init__(
        self,
        app_settings: Settings,
        *,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = app_settings
        self._http_client = http_client
        self._keys: dict[str, jwt.PyJWK] = {}
        self._keys_loaded_at = 0.0
        self._lock = asyncio.Lock()

    @property
    def _supabase_url(self) -> str:
        if self._settings.supabase_url is None:
            raise JWTValidationError("Supabase authentication is not configured")
        return str(self._settings.supabase_url).rstrip("/")

    async def _refresh_keys(self, *, force: bool = False) -> None:
        async with self._lock:
            cache_age = monotonic() - self._keys_loaded_at
            if (
                not force
                and self._keys
                and cache_age < self._settings.supabase_jwks_cache_seconds
            ):
                return

            owns_client = self._http_client is None
            client = self._http_client or httpx.AsyncClient(
                timeout=self._settings.supabase_http_timeout_seconds
            )
            try:
                response = await client.get(
                    f"{self._supabase_url}/auth/v1/.well-known/jwks.json"
                )
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as error:
                raise JWTValidationError("Unable to load Supabase signing keys") from error
            finally:
                if owns_client:
                    await client.aclose()

            if not isinstance(payload, dict):
                raise JWTValidationError("Supabase returned invalid signing keys")

            parsed_keys: dict[str, jwt.PyJWK] = {}
            for raw_key in payload.get("keys", []):
                key_id = raw_key.get("kid")
                if key_id:
                    parsed_keys[key_id] = jwt.PyJWK.from_dict(raw_key)
            if not parsed_keys:
                raise JWTValidationError("Supabase returned no usable signing keys")

            self._keys = parsed_keys
            self._keys_loaded_at = monotonic()

    async def verify(self, token: str) -> AuthenticatedUser:
        try:
            header = jwt.get_unverified_header(token)
            key_id = header.get("kid")
            if not key_id:
                raise JWTValidationError("Access token has no signing key identifier")

            cache_expired = (
                monotonic() - self._keys_loaded_at
                >= self._settings.supabase_jwks_cache_seconds
            )
            if key_id not in self._keys or cache_expired:
                await self._refresh_keys(force=key_id not in self._keys)
            signing_key = self._keys.get(key_id)
            if signing_key is None:
                raise JWTValidationError("Access token uses an unknown signing key")

            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=[signing_key.algorithm_name],
                audience=self._settings.supabase_jwt_audience,
                issuer=f"{self._supabase_url}/auth/v1",
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
            user_id = UUID(claims["sub"])
        except JWTValidationError:
            raise
        except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as error:
            raise JWTValidationError("Access token is invalid") from error

        return AuthenticatedUser(
            id=user_id,
            email=claims.get("email"),
            access_token=token,
            claims=claims,
        )


bearer_scheme = HTTPBearer(auto_error=False)
jwt_verifier = SupabaseJWTVerifier(settings)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer authentication is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return await jwt_verifier.verify(credentials.credentials)
    except JWTValidationError as error:
        configured = settings.supabase_url is not None
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
                if configured
                else status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"} if configured else None,
        ) from error
