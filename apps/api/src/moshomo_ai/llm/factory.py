from __future__ import annotations

from fastapi import HTTPException, status
from pydantic import SecretStr

from moshomo_api.config import Settings, settings
from moshomo_ai.llm.base import LLMClient


def _require_key(key: SecretStr | None, provider: str) -> str:
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Moshomo AI provider '{provider}' is not configured",
        )
    return key.get_secret_value()


def build_llm_client(app_settings: Settings) -> LLMClient:
    provider = app_settings.moshomo_ai_provider
    kwargs = {
        "model": app_settings.moshomo_ai_model,
        "max_tokens": app_settings.moshomo_ai_max_tokens,
        "timeout": app_settings.moshomo_ai_request_timeout_seconds,
    }

    if provider == "anthropic":
        from moshomo_ai.llm.anthropic import AnthropicClient

        return AnthropicClient(api_key=_require_key(app_settings.anthropic_api_key, provider), **kwargs)
    if provider == "openai":
        from moshomo_ai.llm.openai import OpenAIClient

        return OpenAIClient(api_key=_require_key(app_settings.openai_api_key, provider), **kwargs)
    if provider == "google":
        from moshomo_ai.llm.google import GoogleClient

        return GoogleClient(api_key=_require_key(app_settings.google_api_key, provider), **kwargs)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Unsupported Moshomo AI provider '{provider}'",
    )


def get_llm_client() -> LLMClient:
    return build_llm_client(settings)
