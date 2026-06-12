import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://")  # 内存库
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db_session(engine):
    factory = sessionmaker(bind=engine)
    with factory() as session:
        yield session
