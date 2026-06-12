from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.auth import router as auth_router
from app.routes.captures import router as captures_router
from app.supabase_client import SupabaseRestClient, get_supabase_client


def create_app(supabase_client: SupabaseRestClient | None = None,
               profile_worker=None) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        worker = profile_worker
        if worker is None and settings.profile_enabled:
            from app.db import create_sessionmaker
            from app.profile.llm import EmbeddingClient, LLMClient
            from app.profile.queue import ProfileWorker

            worker = ProfileWorker(
                session_factory=create_sessionmaker(settings.database_url),
                llm=LLMClient(settings.llm_base_url, settings.llm_api_key, settings.llm_model),
                embedder=EmbeddingClient(settings.embedding_base_url,
                                         settings.embedding_api_key or "",
                                         settings.embedding_model, settings.embedding_dim),
                value_threshold=settings.profile_value_threshold,
            )
        if worker is not None:
            await worker.start()
            await worker.reconcile()
        app.state.profile_worker = worker
        yield
        if worker is not None:
            await worker.stop()

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
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
