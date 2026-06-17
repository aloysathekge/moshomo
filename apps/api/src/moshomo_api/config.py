from pydantic import AnyHttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MOSHOMO_",
        extra="ignore",
    )


settings = Settings()
