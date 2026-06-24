from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr

import moshomo_api.supabase as supabase_module
from moshomo_api.config import Settings
from moshomo_api.supabase import SupabaseRestClient


def _settings() -> Settings:
    return Settings(
        supabase_url="https://example.supabase.co",
        supabase_publishable_key=SecretStr("publishable"),
        supabase_max_retries=2,
        supabase_retry_backoff_seconds=0.0,
    )


class _FakeResponse:
    def __init__(self, status_code: int, json_data: Any) -> None:
        self.status_code = status_code
        self._json = json_data
        self.content = b"x" if json_data is not None else b""

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://example.supabase.co/rest/v1/employees")
            raise httpx.HTTPStatusError(
                "error",
                request=request,
                response=httpx.Response(self.status_code, request=request),
            )

    def json(self) -> Any:
        return self._json


def _install_script(monkeypatch: pytest.MonkeyPatch, outcomes: list[Any]) -> dict[str, int]:
    """Drive moshomo_api.supabase's httpx.AsyncClient from a scripted list of
    outcomes (each an Exception to raise from request(), or a _FakeResponse to
    return). Returns a counter dict tracking how many requests were attempted."""
    state = {"attempts": 0}
    queue = list(outcomes)

    class _FakeAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "_FakeAsyncClient":
            return self

        async def __aexit__(self, *args: Any) -> bool:
            return False

        async def request(self, *args: Any, **kwargs: Any) -> _FakeResponse:
            state["attempts"] += 1
            outcome = queue.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", _FakeAsyncClient)
    return state


@pytest.mark.asyncio
async def test_get_retries_transient_502_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("GET", "https://example.supabase.co/rest/v1/employees")
    transient = httpx.HTTPStatusError(
        "bad gateway",
        request=request,
        response=httpx.Response(502, request=request),
    )
    state = _install_script(
        monkeypatch,
        [transient, _FakeResponse(200, [{"id": "1"}])],
    )

    client = SupabaseRestClient(_settings())
    rows = await client.select("employees", access_token="t", params={"select": "*"})

    assert rows == [{"id": "1"}]
    assert state["attempts"] == 2  # one failure + one success


@pytest.mark.asyncio
async def test_get_retries_transport_error_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_script(
        monkeypatch,
        [httpx.ConnectError("cold start"), _FakeResponse(200, [{"id": "2"}])],
    )

    client = SupabaseRestClient(_settings())
    rows = await client.select("employees", access_token="t", params={"select": "*"})

    assert rows == [{"id": "2"}]
    assert state["attempts"] == 2


@pytest.mark.asyncio
async def test_get_exhausts_retries_then_raises_502(monkeypatch: pytest.MonkeyPatch) -> None:
    state = _install_script(
        monkeypatch,
        [httpx.ConnectError("x") for _ in range(3)],  # max_retries=2 -> 3 attempts
    )

    client = SupabaseRestClient(_settings())
    with pytest.raises(HTTPException) as exc:
        await client.select("employees", access_token="t", params={"select": "*"})

    assert exc.value.status_code == 502
    assert state["attempts"] == 3  # all attempts consumed


@pytest.mark.asyncio
async def test_write_does_not_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    # A POST whose response was lost must not be retried (would duplicate writes).
    state = _install_script(
        monkeypatch,
        [httpx.ConnectError("x"), _FakeResponse(200, [{"id": "never"}])],
    )

    client = SupabaseRestClient(_settings())
    with pytest.raises(HTTPException) as exc:
        await client.insert("leave_requests", access_token="t", values={"a": 1})

    assert exc.value.status_code == 502
    assert state["attempts"] == 1  # no retry for non-GET
