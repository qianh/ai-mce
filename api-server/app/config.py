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
        default=3650,
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
    profile_enabled: bool = Field(
        default=False, validation_alias=AliasChoices("MCE_PROFILE_ENABLED", "PROFILE_ENABLED")
    )
    llm_base_url: str | None = Field(default=None, validation_alias=AliasChoices("MCE_LLM_BASE_URL", "LLM_BASE_URL"))
    llm_api_key: str | None = Field(default=None, validation_alias=AliasChoices("MCE_LLM_API_KEY", "LLM_API_KEY"))
    llm_model: str | None = Field(default=None, validation_alias=AliasChoices("MCE_LLM_MODEL", "LLM_MODEL"))
    embedding_base_url: str | None = Field(
        default=None, validation_alias=AliasChoices("MCE_EMBEDDING_BASE_URL", "EMBEDDING_BASE_URL")
    )
    embedding_api_key: str | None = Field(
        default=None, validation_alias=AliasChoices("MCE_EMBEDDING_API_KEY", "EMBEDDING_API_KEY")
    )
    embedding_model: str | None = Field(
        default=None, validation_alias=AliasChoices("MCE_EMBEDDING_MODEL", "EMBEDDING_MODEL")
    )
    embedding_dim: int = Field(default=1024, validation_alias=AliasChoices("MCE_EMBEDDING_DIM", "EMBEDDING_DIM"))
    profile_pipeline_version: str = Field(
        default="v1", validation_alias=AliasChoices("MCE_PROFILE_PIPELINE_VERSION", "PROFILE_PIPELINE_VERSION")
    )
    profile_value_threshold: float = Field(
        default=0.3, validation_alias=AliasChoices("MCE_PROFILE_VALUE_THRESHOLD", "PROFILE_VALUE_THRESHOLD")
    )
    dream_cron: str = Field(default="0 4 * * *", validation_alias=AliasChoices("MCE_DREAM_CRON", "DREAM_CRON"))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


def get_settings() -> Settings:
    return Settings()
