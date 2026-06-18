from pathlib import Path

from pydantic import AnyHttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchor the .env to apps/api/ so config loads regardless of the process CWD
# (pnpm dev:api runs uvicorn from the repo root).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    app_name: str = "Moshomo API"
    environment: str = "development"
    pori_mode: str = "adapter"
    supabase_url: AnyHttpUrl | None = None
    supabase_publishable_key: SecretStr | None = None
    supabase_secret_key: SecretStr | None = None
    supabase_invite_redirect_url: AnyHttpUrl = "http://localhost:3000/auth/callback"
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_cache_seconds: int = 3600
    supabase_http_timeout_seconds: float = 10.0

    # Moshomo AI (provider-agnostic workforce assistant)
    moshomo_ai_provider: str = "anthropic"
    moshomo_ai_model: str = "claude-sonnet-4-6"
    moshomo_ai_max_steps: int = 8
    moshomo_ai_max_tokens: int = 4096
    moshomo_ai_request_timeout_seconds: float = 60.0
    anthropic_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    google_api_key: SecretStr | None = None

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_prefix="MOSHOMO_",
        extra="ignore",
    )


settings = Settings()
