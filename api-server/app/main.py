from fastapi import FastAPI
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db import create_database_engine, get_db
from app.models import Base
from app.routes.auth import router as auth_router
from app.routes.captures import router as captures_router


def create_app(database_url: str | None = None, create_schema: bool = False) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    if database_url is not None:
        engine = create_database_engine(database_url)
        if create_schema:
            Base.metadata.create_all(bind=engine)
        TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

        def get_test_db():
            db: Session = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = get_test_db

    app.include_router(auth_router)
    app.include_router(captures_router)

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
