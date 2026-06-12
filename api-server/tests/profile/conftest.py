import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base
import app.profile.models  # noqa: F401  确保分析层表注册到 Base.metadata


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
