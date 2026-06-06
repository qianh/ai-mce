from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(
        default="AI Memory Capture API",
        validation_alias=AliasChoices("AI_MCE_APP_NAME", "APP_NAME"),
    )
    database_url: str = Field(
        default="sqlite:///./api-server.db",
        validation_alias=AliasChoices("AI_MCE_DATABASE_URL", "DATABASE_URL"),
    )
    jwt_secret: str = Field(
        default="dev-only-change-me-dev-only-change-me",
        validation_alias=AliasChoices("AI_MCE_JWT_SECRET", "JWT_SECRET"),
    )
    access_token_minutes: int = Field(
        default=15,
        validation_alias=AliasChoices("AI_MCE_ACCESS_TOKEN_MINUTES", "ACCESS_TOKEN_MINUTES"),
    )
    refresh_token_days: int = Field(
        default=30,
        validation_alias=AliasChoices("AI_MCE_REFRESH_TOKEN_DAYS", "REFRESH_TOKEN_DAYS"),
    )
    supabase_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AI_MCE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    )
    supabase_publishable_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "AI_MCE_SUPABASE_PUBLISHABLE_KEY",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
            "SUPABASE_PUBLISHABLE_KEY",
        ),
    )
    supabase_service_role_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AI_MCE_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def get_settings() -> Settings:
    return Settings()
