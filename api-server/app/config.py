from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Memory Capture API"
    database_url: str = "sqlite:///./api-server.db"
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_prefix="AI_MCE_")


def get_settings() -> Settings:
    return Settings()
