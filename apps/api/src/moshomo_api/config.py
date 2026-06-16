from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Moshomo API"
    environment: str = "development"
    pori_mode: str = "adapter"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MOSHOMO_",
        extra="ignore",
    )


settings = Settings()
