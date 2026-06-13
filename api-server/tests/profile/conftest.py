import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base
import app.profile.models  # noqa: F401  确保分析层表注册到 Base.metadata


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture()
def engine():
    # StaticPool + check_same_thread=False：让 worker 线程（asyncio.to_thread）
    # 与测试线程共享同一个内存库连接
    eng = create_engine("sqlite://", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db_session(engine):
    factory = sessionmaker(bind=engine)
    with factory() as session:
        yield session
