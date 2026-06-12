from sqlalchemy import text

from app.db import create_sessionmaker


def test_create_sessionmaker_creates_working_sessions():
    factory = create_sessionmaker("sqlite://")
    with factory() as session:
        assert session.execute(text("select 1")).scalar() == 1
