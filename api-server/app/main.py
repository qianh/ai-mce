from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.auth import router as auth_router
from app.routes.captures import router as captures_router
from app.supabase_client import SupabaseRestClient, get_supabase_client


def create_app(supabase_client: SupabaseRestClient | None = None) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^(chrome-extension://.*|moz-extension://.*|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["authorization", "content-type"],
    )

    if supabase_client is not None:
        app.dependency_overrides[get_supabase_client] = lambda: supabase_client

    app.include_router(auth_router)
    app.include_router(captures_router)

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
