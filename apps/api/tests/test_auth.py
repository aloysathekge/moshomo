from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from moshomo_api.auth import JWTValidationError, SupabaseJWTVerifier
from moshomo_api.config import Settings


def _base64url_uint(value: int) -> str:
    size = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(size, "big")).rstrip(b"=").decode()


@pytest.mark.asyncio
async def test_verifies_supabase_es256_access_token() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()
    key_id = "test-key"
    jwk = {
        "alg": "ES256",
        "crv": "P-256",
        "kid": key_id,
        "kty": "EC",
        "use": "sig",
        "x": _base64url_uint(public_numbers.x),
        "y": _base64url_uint(public_numbers.y),
    }
    now = datetime.now(timezone.utc)
    user_id = uuid4()
    token = jwt.encode(
        {
            "sub": str(user_id),
            "email": "manager@example.com",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": key_id},
    )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"keys": [jwk]}, request=request)
        )
    ) as client:
        verifier = SupabaseJWTVerifier(
            Settings(supabase_url="https://example.supabase.co"),
            http_client=client,
        )
        user = await verifier.verify(token)

    assert user.id == user_id
    assert user.email == "manager@example.com"
    assert user.access_token == token


@pytest.mark.asyncio
async def test_rejects_token_with_wrong_audience() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()
    jwk = {
        "alg": "ES256",
        "crv": "P-256",
        "kid": "test-key",
        "kty": "EC",
        "use": "sig",
        "x": _base64url_uint(public_numbers.x),
        "y": _base64url_uint(public_numbers.y),
    }
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "aud": "wrong-audience",
            "iss": "https://example.supabase.co/auth/v1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"keys": [jwk]}, request=request)
        )
    ) as client:
        verifier = SupabaseJWTVerifier(
            Settings(supabase_url="https://example.supabase.co"),
            http_client=client,
        )
        with pytest.raises(JWTValidationError, match="invalid"):
            await verifier.verify(token)
