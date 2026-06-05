from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def create_database_engine(database_url: str | None = None):
    settings = get_settings()
    url = database_url or settings.database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


def create_sessionmaker(database_url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=create_database_engine(database_url), autoflush=False, autocommit=False)


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
