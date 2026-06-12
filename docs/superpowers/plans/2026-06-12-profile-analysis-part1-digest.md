# Profile Analysis · Part 1/3 — 数据层 + LLM Client + Digest 管线 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 规格判据：`openspec/changes/profile-analysis/`（specs/profile-digest 全部 6 条 Requirement + cloud-mode-api-server delta）。风险 H：TDD Guard 生效，所有实现先测后码；合并前需人批。

**Goal:** capture 入库后能被异步消化：清洗 → Task Segment 切分 → Memory Atom 蒸馏（pending 状态），增量 diff 与幂等齐备。

**Architecture:** api-server 内新增 `app/profile/` 包（models/redact/llm/cleaning/segmenter/distiller/diff/digest/queue）。分析层经 SQLAlchemy 直连 `database_url`（测试 sqlite / 生产 Supabase Postgres，embedding 列用 TypeDecorator 双方言兼容）。LLM/embedding 走 OpenAI 兼容 HTTP，测试用 `httpx.MockTransport` 注入。

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, alembic, httpx, pydantic, pgvector（新增依赖）, pytest。

**约定（全计划通用）：**
- 测试命令一律 `cd /Users/hong/John/ai/ai-mce/api-server && uv run pytest <path> -v`
- 提交一律在 feature 分支（N5 开工时由 worktree 建立），消息格式 `feat(profile): ...`
- 七维度枚举：`basic_info | project_context | working_style | language_style | problem_solving | skill_signal | ai_usage`
- 原子类型枚举：`fact | preference | skill_signal | project_context | behavior_pattern`
- `PIPELINE_VERSION = "v1"`；embedding 维度固定 1024（Gate 2 决议 bge-m3）

---

## File Structure

```
api-server/
  pyproject.toml                     # Modify: +pgvector
  app/config.py                      # Modify: +profile settings
  app/db.py                          # Create: SQLAlchemy session factory
  app/profile/__init__.py            # Create
  app/profile/models.py              # Create: 9 张分析层表 + EmbeddingVector
  app/profile/redact.py              # Create: 出口脱敏
  app/profile/llm.py                 # Create: chat + embedding client
  app/profile/cleaning.py            # Create: 规则清洗
  app/profile/segmenter.py           # Create: 切分（规则预切 + LLM 边界）
  app/profile/distiller.py           # Create: 原子蒸馏
  app/profile/diff.py                # Create: message_hashes 增量判定
  app/profile/digest.py              # Create: 消化编排（幂等 + supersede）
  app/profile/queue.py               # Create: asyncio 队列 + worker + 启动对账
  app/main.py                        # Modify: lifespan 接入 worker
  app/routes/captures.py             # Modify: 入库钩子
  app/alembic/versions/0005_profile_tables.py   # Create
  tests/profile/__init__.py          # Create
  tests/profile/conftest.py          # Create: sqlite engine + session fixture
  tests/profile/test_redact.py       # Create
  tests/profile/test_llm.py          # Create
  tests/profile/test_cleaning.py     # Create
  tests/profile/test_segmenter.py    # Create
  tests/profile/test_distiller.py    # Create
  tests/profile/test_diff.py         # Create
  tests/profile/test_digest.py       # Create
  tests/profile/test_queue.py        # Create
  tests/profile/test_capture_hook.py # Create
```

---

### Task 1: 配置扩展（profile settings）

**Files:**
- Modify: `api-server/app/config.py`
- Test: `api-server/tests/profile/test_config.py`

- [ ] **Step 1.1 写失败测试**

```python
# tests/profile/__init__.py  （空文件）
# tests/profile/test_config.py
from app.config import Settings


def test_profile_settings_defaults():
    s = Settings(_env_file=None)
    assert s.profile_enabled is False
    assert s.embedding_dim == 1024
    assert s.profile_pipeline_version == "v1"
    assert s.profile_value_threshold == 0.3


def test_profile_settings_from_env(monkeypatch):
    monkeypatch.setenv("MCE_PROFILE_ENABLED", "true")
    monkeypatch.setenv("MCE_LLM_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("MCE_LLM_API_KEY", "k")
    monkeypatch.setenv("MCE_LLM_MODEL", "deepseek-chat")
    monkeypatch.setenv("MCE_EMBEDDING_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("MCE_EMBEDDING_MODEL", "bge-m3")
    s = Settings(_env_file=None)
    assert s.profile_enabled is True
    assert s.llm_model == "deepseek-chat"
    assert s.embedding_base_url.endswith("/v1")
```

- [ ] **Step 1.2 跑测试确认失败**：`uv run pytest tests/profile/test_config.py -v` → FAIL（属性不存在）
- [ ] **Step 1.3 实现**：`app/config.py` 的 `Settings` 末尾追加：

```python
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
```

- [ ] **Step 1.4 跑测试确认通过**，且全量回归 `uv run pytest -v` 不破坏既有用例
- [ ] **Step 1.5 提交**：`git commit -m "feat(profile): add profile pipeline settings"`

---

### Task 2: DB session 工厂

**Files:**
- Create: `api-server/app/db.py`
- Test: `api-server/tests/profile/conftest.py`、`api-server/tests/profile/test_db.py`

- [ ] **Step 2.1 写共享 fixture 与失败测试**

```python
# tests/profile/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base
import app.profile.models  # noqa: F401  确保分析层表注册到 Base.metadata（Task 3 创建）


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
```

```python
# tests/profile/test_db.py
from app.db import build_session_factory


def test_build_session_factory_creates_working_sessions():
    factory = build_session_factory("sqlite://")
    with factory() as session:
        assert session.execute(__import__("sqlalchemy").text("select 1")).scalar() == 1
```

- [ ] **Step 2.2 跑测试确认失败**：`uv run pytest tests/profile/test_db.py -v` → FAIL（app.db 不存在）。conftest 对 `app.profile.models` 的 import 此刻也失败——临时注释该行，Task 3 完成后恢复。
- [ ] **Step 2.3 实现**

```python
# app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


def build_session_factory(database_url: str) -> sessionmaker[Session]:
    engine = create_engine(database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, expire_on_commit=False)
```

- [ ] **Step 2.4 跑测试确认通过**
- [ ] **Step 2.5 提交**：`git commit -m "feat(profile): add sqlalchemy session factory"`

---

### Task 3: 分析层模型（9 张表 + EmbeddingVector）

**Files:**
- Create: `api-server/app/profile/__init__.py`（空）、`api-server/app/profile/models.py`
- Modify: `api-server/pyproject.toml`（dependencies 增加 `"pgvector>=0.3.6"`，然后 `uv sync`）
- Test: `api-server/tests/profile/test_models.py`

- [ ] **Step 3.1 写失败测试**

```python
# tests/profile/test_models.py
from uuid import uuid4

from app.profile import models as pm


def test_all_profile_tables_create_on_sqlite(engine):
    # conftest 的 create_all 已执行；存在性即通过 Base.metadata 验证
    from app.models import Base
    names = set(Base.metadata.tables)
    assert {
        "analysis_runs", "task_segments", "memory_atoms", "profile_claims",
        "claim_evidence", "dream_runs", "profile_snapshots", "user_briefs", "calibrations",
    } <= names


def test_analysis_run_idempotency_unique(db_session):
    from sqlalchemy.exc import IntegrityError
    import pytest as _pytest

    uid, cid = uuid4(), uuid4()
    db_session.add(pm.AnalysisRun(user_id=uid, capture_id=cid, content_hash="h1",
                                  pipeline_version="v1", run_type="digest", status="succeeded"))
    db_session.commit()
    db_session.add(pm.AnalysisRun(user_id=uid, capture_id=cid, content_hash="h1",
                                  pipeline_version="v1", run_type="digest", status="queued"))
    with _pytest.raises(IntegrityError):
        db_session.commit()


def test_memory_atom_roundtrip_with_embedding(db_session):
    uid = uuid4()
    atom = pm.MemoryAtom(user_id=uid, capture_id=uuid4(), segment_id=None,
                         atom_type="preference", dimension="language_style",
                         content="回复必须使用中文", confidence=0.9,
                         status="pending", embedding=[0.1] * 4)
    db_session.add(atom)
    db_session.commit()
    got = db_session.get(pm.MemoryAtom, atom.id)
    assert got.embedding == [0.1] * 4 and got.status == "pending"
```

- [ ] **Step 3.2 跑测试确认失败**（模块不存在）
- [ ] **Step 3.3 实现 `app/profile/models.py`**（沿用 `app/models.py` 的声明风格，挂同一个 `Base`）

```python
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        TypeDecorator, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid

from app.models import Base

EMBEDDING_DIM = 1024  # 必须与 MCE_EMBEDDING_DIM 及迁移 0005 一致（Gate 2: bge-m3）

PROFILE_DIMENSIONS = ("basic_info", "project_context", "working_style", "language_style",
                      "problem_solving", "skill_signal", "ai_usage")
ATOM_TYPES = ("fact", "preference", "skill_signal", "project_context", "behavior_pattern")


class EmbeddingVector(TypeDecorator):
    """Postgres 用 pgvector，其他方言（sqlite 测试）退化为 JSON。"""
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector
            return dialect.type_descriptor(Vector(EMBEDDING_DIM))
        return dialect.type_descriptor(JSON())


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        UniqueConstraint("capture_id", "content_hash", "pipeline_version",
                         name="uq_analysis_runs_idempotency"),
        Index("ix_analysis_runs_capture", "capture_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(32), nullable=False)
    run_type: Mapped[str] = mapped_column(String(16), nullable=False)   # digest|redigest|backfill
    diff_type: Mapped[str | None] = mapped_column(String(16))           # new|append_only|modified|noop
    message_hashes: Mapped[list | None] = mapped_column(JSON)
    digested_range: Mapped[dict | None] = mapped_column(JSON)           # {"start": int, "end": int}
    status: Mapped[str] = mapped_column(String(16), nullable=False)     # queued|running|succeeded|failed
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TaskSegment(Base):
    __tablename__ = "task_segments"
    __table_args__ = (Index("ix_task_segments_capture_status", "capture_id", "status"),)
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    analysis_run_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True),
                                                  ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False)
    start_index: Mapped[int] = mapped_column(Integer, nullable=False)
    end_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    scenario: Mapped[str] = mapped_column(String(32), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    value_score: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active|superseded
    supersedes_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MemoryAtom(Base):
    __tablename__ = "memory_atoms"
    __table_args__ = (Index("ix_memory_atoms_status", "user_id", "status"),)
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    segment_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True),
                                                    ForeignKey("task_segments.id", ondelete="SET NULL"))
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    atom_type: Mapped[str] = mapped_column(String(32), nullable=False)
    dimension: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_start: Mapped[int | None] = mapped_column(Integer)
    evidence_end: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # pending|fused|superseded|rejected
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    fused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProfileClaim(Base):
    __tablename__ = "profile_claims"
    __table_args__ = (Index("ix_profile_claims_user_status", "user_id", "status"),)
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dimension: Mapped[str] = mapped_column(String(32), nullable=False)
    project_key: Mapped[str | None] = mapped_column(Text)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="candidate")
    # candidate|active|user_confirmed|weakened|deprecated|user_rejected
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    last_reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ClaimEvidence(Base):
    __tablename__ = "claim_evidence"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    claim_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True),
                                           ForeignKey("profile_claims.id", ondelete="CASCADE"), nullable=False)
    atom_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True),
                                          ForeignKey("memory_atoms.id", ondelete="CASCADE"), nullable=False)
    polarity: Mapped[str] = mapped_column(String(16), nullable=False)   # supporting|contradicting
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active|superseded
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DreamRun(Base):
    __tablename__ = "dream_runs"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)     # running|succeeded|failed
    stats: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ProfileSnapshot(Base):
    __tablename__ = "profile_snapshots"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dream_run_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True),
                                               ForeignKey("dream_runs.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    changes: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserBrief(Base):
    __tablename__ = "user_briefs"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_claim_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Calibration(Base):
    __tablename__ = "calibrations"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    claim_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True),
                                           ForeignKey("profile_claims.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)     # confirm|reject|correct
    corrected_text: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
```

- [ ] **Step 3.4** `uv add pgvector`；恢复 conftest 中被注释的 import；跑 `uv run pytest tests/profile/test_models.py -v` → PASS；全量回归
- [ ] **Step 3.5 提交**：`git commit -m "feat(profile): analysis-layer models with dual-dialect embedding type"`

---

### Task 4: alembic 迁移 0005

**Files:**
- Create: `api-server/app/alembic/versions/0005_profile_tables.py`

- [ ] **Step 4.1 实现迁移**（手写，风格沿用 0004；Postgres 上先建扩展）

```python
"""profile-analysis: 9 analysis-layer tables + pgvector

Revision ID: 0005_profile_tables
Revises: 0004_add_session_id
Create Date: 2026-06-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.profile.models import (AnalysisRun, Calibration, ClaimEvidence, DreamRun,
                                MemoryAtom, ProfileClaim, ProfileSnapshot, TaskSegment, UserBrief)

revision: str = "0005_profile_tables"
down_revision: str | None = "0004_add_session_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [AnalysisRun, TaskSegment, MemoryAtom, ProfileClaim, ClaimEvidence,
           DreamRun, ProfileSnapshot, UserBrief, Calibration]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    for model in _TABLES:
        model.__table__.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for model in reversed(_TABLES):
        model.__table__.drop(bind, checkfirst=True)
```

- [ ] **Step 4.2 本地验证升降级**：`uv run alembic upgrade head && uv run alembic downgrade 0004_add_session_id && uv run alembic upgrade head`，Expected：三次均无报错（本地 sqlite 走 JSON 列分支）
- [ ] **Step 4.3 提交**：`git commit -m "feat(profile): alembic migration 0005 for analysis tables"`

---

### Task 5: 出口脱敏器

**Files:**
- Create: `api-server/app/profile/redact.py`
- Test: `api-server/tests/profile/test_redact.py`

- [ ] **Step 5.1 写失败测试**

```python
# tests/profile/test_redact.py
from app.profile.redact import redact


def test_redacts_known_secret_shapes():
    text = (
        "export OPENAI_API_KEY=sk-abc123DEF456ghi789jkl\n"
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZQ\n"
        "password = hunter2secret\n"
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n"
        "supabase service key sb_" "secret_FAKE_TEST_0000000000000000"
    )
    out = redact(text)
    assert "sk-abc123DEF456ghi789jkl" not in out
    assert "hunter2secret" not in out
    assert "BEGIN RSA PRIVATE KEY" not in out
    assert "sb_secret_" not in out
    assert "eyJhbGciOiJIUzI1NiJ9" not in out
    assert "[REDACTED:api_key]" in out and "[REDACTED:password]" in out


def test_keeps_normal_code_untouched():
    text = "def hash_password(p): return sha256(p).hexdigest()  # 讨论密码哈希实现"
    assert redact(text) == text
```

- [ ] **Step 5.2 跑测试确认失败**
- [ ] **Step 5.3 实现**

```python
# app/profile/redact.py
import re

_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")),
    ("api_key", re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b")),
    ("api_key", re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}\b")),
    ("bearer_token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._-]{20,}\b")),
    ("password", re.compile(r"(?i)\b(password|passwd|secret|token|api[_-]?key)\b\s*[=:]\s*\S+")),
]


def redact(text: str) -> str:
    for name, pattern in _PATTERNS:
        text = pattern.sub(f"[REDACTED:{name}]", text)
    return text
```

- [ ] **Step 5.4 跑测试确认通过**（注意顺序：private_key/jwt 先于通用 password 规则，避免占位符二次替换）
- [ ] **Step 5.5 提交**：`git commit -m "feat(profile): outbound redactor for llm calls"`

---

### Task 6: LLM chat client（JSON 约束输出 + 重试）

**Files:**
- Create: `api-server/app/profile/llm.py`
- Test: `api-server/tests/profile/test_llm.py`

- [ ] **Step 6.1 写失败测试**（用 `httpx.MockTransport`，不打真网络）

```python
# tests/profile/test_llm.py
import json

import httpx
import pytest
from pydantic import BaseModel

from app.profile.llm import LLMClient, LLMError


class Echo(BaseModel):
    value: str


def _client(handler) -> LLMClient:
    return LLMClient(base_url="https://llm.test/v1", api_key="k", model="m",
                     transport=httpx.MockTransport(handler))


def _chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_chat_json_parses_into_model():
    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "m"
        assert body["response_format"] == {"type": "json_object"}
        return _chat_response('{"value": "ok"}')
    out = _client(handler).chat_json("sys", "user", Echo)
    assert out == Echo(value="ok")


def test_chat_json_retries_on_invalid_then_succeeds():
    calls = {"n": 0}
    def handler(request):
        calls["n"] += 1
        return _chat_response("not json" if calls["n"] == 1 else '{"value": "ok"}')
    out = _client(handler).chat_json("sys", "user", Echo, max_retries=2)
    assert out.value == "ok" and calls["n"] == 2


def test_chat_json_raises_after_exhausted_retries():
    def handler(request):
        return _chat_response("still not json")
    with pytest.raises(LLMError):
        _client(handler).chat_json("sys", "user", Echo, max_retries=2)
```

- [ ] **Step 6.2 跑测试确认失败**
- [ ] **Step 6.3 实现**

```python
# app/profile/llm.py
import json

import httpx
from pydantic import BaseModel, ValidationError


class LLMError(RuntimeError):
    pass


class LLMClient:
    """OpenAI 兼容 /chat/completions 客户端；transport 注入供测试。"""

    def __init__(self, base_url: str, api_key: str, model: str,
                 transport: httpx.BaseTransport | None = None, timeout: float = 120.0):
        self.model = model
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )

    def chat_json[T: BaseModel](self, system: str, user: str, response_model: type[T],
                                max_retries: int = 2, temperature: float = 0.1) -> T:
        last_error: Exception | None = None
        for _ in range(max_retries):
            resp = self._http.post("/chat/completions", json={
                "model": self.model,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
            })
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            try:
                return response_model.model_validate(json.loads(content))
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
        raise LLMError(f"LLM output failed validation after {max_retries} attempts") from last_error
```

- [ ] **Step 6.4 跑测试确认通过**
- [ ] **Step 6.5 提交**：`git commit -m "feat(profile): openai-compatible llm client with json validation"`

---

### Task 7: Embedding client

**Files:**
- Modify: `api-server/app/profile/llm.py`（追加 EmbeddingClient）
- Test: `api-server/tests/profile/test_llm.py`（追加）

- [ ] **Step 7.1 写失败测试**（追加到 test_llm.py）

```python
from app.profile.llm import EmbeddingClient, LLMError as _LLMError


def test_embed_batches_and_validates_dim():
    def handler(request):
        body = json.loads(request.content)
        return httpx.Response(200, json={"data": [
            {"index": i, "embedding": [0.5] * 4} for i in range(len(body["input"]))
        ]})
    client = EmbeddingClient(base_url="https://emb.test/v1", api_key="", model="bge-m3",
                             dim=4, transport=httpx.MockTransport(handler))
    out = client.embed(["a", "b"])
    assert len(out) == 2 and all(len(v) == 4 for v in out)


def test_embed_rejects_wrong_dim():
    def handler(request):
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.5] * 3}]})
    client = EmbeddingClient(base_url="https://emb.test/v1", api_key="", model="bge-m3",
                             dim=4, transport=httpx.MockTransport(handler))
    with pytest.raises(_LLMError):
        client.embed(["a"])
```

- [ ] **Step 7.2 跑测试确认失败**
- [ ] **Step 7.3 实现**（追加到 `app/profile/llm.py`）

```python
class EmbeddingClient:
    """OpenAI 兼容 /embeddings 客户端（Ollama 的 /v1 端点同样适用）。"""

    def __init__(self, base_url: str, api_key: str, model: str, dim: int,
                 transport: httpx.BaseTransport | None = None, timeout: float = 60.0):
        self.model, self.dim = model, dim
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=headers,
                                  timeout=timeout, transport=transport)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = self._http.post("/embeddings", json={"model": self.model, "input": texts})
        resp.raise_for_status()
        rows = sorted(resp.json()["data"], key=lambda d: d["index"])
        vectors = [row["embedding"] for row in rows]
        if any(len(v) != self.dim for v in vectors):
            raise LLMError(f"embedding dim mismatch, expected {self.dim}")
        return vectors
```

- [ ] **Step 7.4 跑测试确认通过**
- [ ] **Step 7.5 提交**：`git commit -m "feat(profile): embedding client with dim validation"`

---

### Task 8: 清洗器（纯规则）

**Files:**
- Create: `api-server/app/profile/cleaning.py`
- Test: `api-server/tests/profile/test_cleaning.py`

- [ ] **Step 8.1 写失败测试**

```python
# tests/profile/test_cleaning.py
from app.profile.cleaning import CleanMessage, clean_messages


def _msg(role, content, index):
    return {"role": role, "content": content, "index": index}


def test_drops_tool_and_empty_keeps_dialogue_backbone():
    messages = [
        _msg("user", "排查 scanner 并发 bug", 0),
        _msg("tool", "$ go test ./...\n" + "FAIL\n" * 500, 1),
        _msg("assistant", "先看 watermark 锁", 2),
        _msg("user", "", 3),
        _msg("system", "you are...", 4),
    ]
    out = clean_messages(messages)
    assert [m.index for m in out] == [0, 2]
    assert all(isinstance(m, CleanMessage) for m in out)


def test_truncates_overlong_content_keeping_head_and_tail():
    long = "A" * 5000
    out = clean_messages([_msg("assistant", long, 0)])
    assert len(out[0].content) < 2100
    assert out[0].content.startswith("A" * 100)
    assert "…[truncated]…" in out[0].content
    assert out[0].content.endswith("A" * 100)
```

- [ ] **Step 8.2 跑测试确认失败**
- [ ] **Step 8.3 实现**

```python
# app/profile/cleaning.py
from dataclasses import dataclass

MAX_CONTENT_CHARS = 2000
_HEAD = 800
_TAIL = 800
_KEEP_ROLES = {"user", "assistant"}


@dataclass(frozen=True)
class CleanMessage:
    index: int      # 原始消息 index，证据区间以此为准
    role: str
    content: str


def _truncate(content: str) -> str:
    if len(content) <= MAX_CONTENT_CHARS:
        return content
    return f"{content[:_HEAD]}…[truncated]…{content[-_TAIL:]}"


def clean_messages(messages: list[dict]) -> list[CleanMessage]:
    out: list[CleanMessage] = []
    for msg in messages:
        role = msg.get("role", "")
        content = (msg.get("content") or "").strip()
        if role not in _KEEP_ROLES or not content:
            continue
        out.append(CleanMessage(index=msg.get("index", len(out)), role=role,
                                content=_truncate(content)))
    return out
```

- [ ] **Step 8.4 跑测试确认通过**
- [ ] **Step 8.5 提交**：`git commit -m "feat(profile): rule-based message cleaner"`

---

### Task 9: 切分器（规则预切 + LLM 边界）

**Files:**
- Create: `api-server/app/profile/segmenter.py`
- Test: `api-server/tests/profile/test_segmenter.py`

- [ ] **Step 9.1 写失败测试**

```python
# tests/profile/test_segmenter.py
import pytest
from pydantic import BaseModel

from app.profile.cleaning import CleanMessage
from app.profile.segmenter import SegmentDraft, split_segments


class FakeLLM:
    """duck-type LLMClient.chat_json；记录 prompt 供脱敏断言。"""
    def __init__(self, responses):
        self.responses, self.prompts = list(responses), []

    def chat_json(self, system, user, response_model, **kw):
        self.prompts.append(user)
        return response_model.model_validate(self.responses.pop(0))


def _msgs(n, prefix="msg"):
    return [CleanMessage(index=i, role="user" if i % 2 == 0 else "assistant",
                         content=f"{prefix}{i}") for i in range(n)]


def test_split_returns_validated_segments():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 3, "title": "架构讨论", "scenario": "planning",
         "summary": "讨论了画像系统架构", "value_score": 0.8},
        {"start_index": 4, "end_index": 7, "title": "bug 排查", "scenario": "debugging",
         "summary": "排查并发问题", "value_score": 0.7},
    ]}])
    out = split_segments(_msgs(8), llm)
    assert [s.title for s in out] == ["架构讨论", "bug 排查"]
    assert out[0].end_index < out[1].start_index


def test_split_rejects_out_of_range_or_overlap():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 99, "title": "x", "scenario": "planning",
         "summary": "s", "value_score": 0.5}]}])
    with pytest.raises(ValueError):
        split_segments(_msgs(4), llm)


def test_prompt_is_redacted():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 1, "title": "x", "scenario": "coding",
         "summary": "s", "value_score": 0.5}]}])
    msgs = [CleanMessage(index=0, role="user", content="key sk-abc123DEF456ghi789jkl"),
            CleanMessage(index=1, role="assistant", content="ok")]
    split_segments(msgs, llm)
    assert "sk-abc123DEF456ghi789jkl" not in llm.prompts[0]
```

- [ ] **Step 9.2 跑测试确认失败**
- [ ] **Step 9.3 实现**

```python
# app/profile/segmenter.py
from pydantic import BaseModel, Field

from app.profile.cleaning import CleanMessage
from app.profile.redact import redact

SCENARIOS = ("daily_qa", "coding", "debugging", "planning", "research",
             "writing", "decision", "project_management")
_CHUNK_SIZE = 60  # 规则预切：每块最多 60 条清洗后消息

_SYSTEM = """你是会话切分器。把 AI 对话按"任务目标"切成连续区间（Task Segment）。
规则：区间用消息 index 表示且不重叠不越界；scenario 取值 {scenarios}；
value_score ∈ [0,1] 衡量该段对刻画用户长期画像的价值；summary 用中文一句话。
只输出 JSON。""".format(scenarios="|".join(SCENARIOS))


class SegmentDraft(BaseModel):
    start_index: int
    end_index: int
    title: str
    scenario: str
    summary: str
    value_score: float = Field(ge=0, le=1)


class _SegmentList(BaseModel):
    segments: list[SegmentDraft]


def _render(messages: list[CleanMessage]) -> str:
    lines = [f"[{m.index}] {m.role}: {redact(m.content)}" for m in messages]
    return "\n".join(lines)


def _validate(segments: list[SegmentDraft], messages: list[CleanMessage]) -> None:
    valid_indexes = {m.index for m in messages}
    prev_end = -1
    for seg in segments:
        if seg.start_index > seg.end_index or seg.start_index <= prev_end:
            raise ValueError(f"segment overlap/disorder: {seg}")
        if seg.start_index not in valid_indexes or seg.end_index not in valid_indexes:
            raise ValueError(f"segment out of range: {seg}")
        if seg.scenario not in SCENARIOS:
            raise ValueError(f"unknown scenario: {seg.scenario}")
        prev_end = seg.end_index


def split_segments(messages: list[CleanMessage], llm) -> list[SegmentDraft]:
    if not messages:
        return []
    result: list[SegmentDraft] = []
    for i in range(0, len(messages), _CHUNK_SIZE):
        chunk = messages[i:i + _CHUNK_SIZE]
        out = llm.chat_json(_SYSTEM, _render(chunk), _SegmentList)
        _validate(out.segments, chunk)
        result.extend(out.segments)
    return result
```

- [ ] **Step 9.4 跑测试确认通过**
- [ ] **Step 9.5 提交**：`git commit -m "feat(profile): task segmenter with llm boundary detection"`

---

### Task 10: Distiller（原子蒸馏）

**Files:**
- Create: `api-server/app/profile/distiller.py`
- Test: `api-server/tests/profile/test_distiller.py`

- [ ] **Step 10.1 写失败测试**

```python
# tests/profile/test_distiller.py
import pytest

from app.profile.cleaning import CleanMessage
from app.profile.distiller import AtomDraft, distill_segment
from app.profile.segmenter import SegmentDraft
from tests.profile.test_segmenter import FakeLLM


def _seg(start=0, end=3, score=0.8):
    return SegmentDraft(start_index=start, end_index=end, title="t",
                        scenario="planning", summary="s", value_score=score)


def _msgs():
    return [CleanMessage(index=i, role="user" if i % 2 == 0 else "assistant",
                         content=f"c{i}") for i in range(4)]


def test_distill_returns_atoms_with_evidence_range():
    llm = FakeLLM([{"atoms": [
        {"atom_type": "preference", "dimension": "language_style",
         "content": "要求所有回复使用中文", "confidence": 0.9,
         "evidence_start": 0, "evidence_end": 1},
    ]}])
    atoms = distill_segment(_seg(), _msgs(), llm)
    assert atoms[0].dimension == "language_style"
    assert 0 <= atoms[0].evidence_start <= atoms[0].evidence_end <= 3


def test_distill_skips_low_value_segment():
    llm = FakeLLM([])  # 不应被调用
    assert distill_segment(_seg(score=0.1), _msgs(), llm, value_threshold=0.3) == []


def test_distill_rejects_bad_dimension():
    llm = FakeLLM([{"atoms": [
        {"atom_type": "fact", "dimension": "personality",  # 非法维度
         "content": "x", "confidence": 0.5, "evidence_start": 0, "evidence_end": 0},
    ]}])
    with pytest.raises(ValueError):
        distill_segment(_seg(), _msgs(), llm)
```

- [ ] **Step 10.2 跑测试确认失败**
- [ ] **Step 10.3 实现**

```python
# app/profile/distiller.py
from pydantic import BaseModel, Field

from app.profile.cleaning import CleanMessage
from app.profile.models import ATOM_TYPES, PROFILE_DIMENSIONS
from app.profile.redact import redact
from app.profile.segmenter import SegmentDraft

_SYSTEM = """你是记忆蒸馏器。从一个任务段中抽取关于"用户本人"的最小可证据化事实（Memory Atom）。
约束：
- atom_type ∈ {types}；dimension ∈ {dims}
- content 用中文、单句、描述可观察的行为/事实/偏好
- 红线：禁止心理、人格、能力高低判断（如"焦虑""不擅长"）；只描述行为模式
- evidence_start/evidence_end 为支撑该原子的消息 index 区间（必须落在给定消息内）
- confidence ∈ (0,1]；没有把握的内容宁可不抽
只输出 JSON。""".format(types="|".join(ATOM_TYPES), dims="|".join(PROFILE_DIMENSIONS))


class AtomDraft(BaseModel):
    atom_type: str
    dimension: str
    content: str
    confidence: float = Field(gt=0, le=1)
    evidence_start: int
    evidence_end: int


class _AtomList(BaseModel):
    atoms: list[AtomDraft]


def distill_segment(segment: SegmentDraft, messages: list[CleanMessage], llm,
                    value_threshold: float = 0.3) -> list[AtomDraft]:
    if segment.value_score < value_threshold:
        return []
    in_range = [m for m in messages if segment.start_index <= m.index <= segment.end_index]
    prompt = (f"任务段：{segment.title}（{segment.scenario}）\n摘要：{segment.summary}\n\n"
              + "\n".join(f"[{m.index}] {m.role}: {redact(m.content)}" for m in in_range))
    out = llm.chat_json(_SYSTEM, prompt, _AtomList)
    valid = {m.index for m in in_range}
    for atom in out.atoms:
        if atom.atom_type not in ATOM_TYPES or atom.dimension not in PROFILE_DIMENSIONS:
            raise ValueError(f"invalid atom enums: {atom}")
        if atom.evidence_start not in valid or atom.evidence_end not in valid \
                or atom.evidence_start > atom.evidence_end:
            raise ValueError(f"invalid evidence range: {atom}")
    return out.atoms
```

- [ ] **Step 10.4 跑测试确认通过**
- [ ] **Step 10.5 提交**：`git commit -m "feat(profile): memory atom distiller with red-line constraints"`

---

### Task 11: 增量 diff 判定

**Files:**
- Create: `api-server/app/profile/diff.py`
- Test: `api-server/tests/profile/test_diff.py`

- [ ] **Step 11.1 写失败测试**

```python
# tests/profile/test_diff.py
from app.profile.diff import DiffResult, compute_message_hashes, diff_hashes


def test_compute_message_hashes_is_stable():
    msgs = [{"role": "user", "content": "a", "index": 0}]
    assert compute_message_hashes(msgs) == compute_message_hashes(msgs)


def test_noop_when_identical():
    old = ["h1", "h2", "h3"]
    assert diff_hashes(old, old) == DiffResult(diff_type="noop", new_start=None)


def test_append_only_detects_new_range_start():
    out = diff_hashes(["h1", "h2"], ["h1", "h2", "h3", "h4"])
    assert out.diff_type == "append_only" and out.new_start == 2


def test_modified_when_prefix_broken():
    out = diff_hashes(["h1", "h2", "h3"], ["h1", "hX", "h3"])
    assert out.diff_type == "modified" and out.new_start is None


def test_new_when_no_previous():
    out = diff_hashes(None, ["h1"])
    assert out.diff_type == "new"
```

- [ ] **Step 11.2 跑测试确认失败**
- [ ] **Step 11.3 实现**

```python
# app/profile/diff.py
import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class DiffResult:
    diff_type: str            # new | noop | append_only | modified
    new_start: int | None     # append_only 时：新增区间起始消息位置（列表位置）


def compute_message_hashes(messages: list[dict]) -> list[str]:
    return [
        hashlib.sha256(f"{m.get('role','')}\x00{(m.get('content') or '').strip()}".encode()).hexdigest()
        for m in messages
    ]


def diff_hashes(old: list[str] | None, new: list[str]) -> DiffResult:
    if not old:
        return DiffResult("new", None)
    if old == new:
        return DiffResult("noop", None)
    if len(new) > len(old) and new[: len(old)] == old:
        return DiffResult("append_only", len(old))
    return DiffResult("modified", None)
```

- [ ] **Step 11.4 跑测试确认通过**
- [ ] **Step 11.5 提交**：`git commit -m "feat(profile): message-hash incremental diff"`

---

### Task 12: Digest 编排（幂等 + supersede + 上下文 buffer）

**Files:**
- Create: `api-server/app/profile/digest.py`
- Test: `api-server/tests/profile/test_digest.py`

说明：digest 直接经 SQLAlchemy 读 `captures` 表（测试中用 `app.models.Capture` 在 sqlite 建好）。FakeLLM/FakeEmbedder duck-type 注入。

- [ ] **Step 12.1 写失败测试**

```python
# tests/profile/test_digest.py
from uuid import uuid4

from app.models import Capture, User
from app.profile import models as pm
from app.profile.digest import digest_capture
from tests.profile.test_segmenter import FakeLLM


class FakeEmbedder:
    def __init__(self, dim=4):
        self.dim = dim
    def embed(self, texts):
        return [[0.1] * self.dim for _ in texts]


def _make_capture(session, messages, content_hash="hash-1"):
    user = User(email=f"{uuid4()}@t.co", password_hash="x")
    session.add(user)
    session.flush()
    cap = Capture(user_id=user.id, source_platform="claude", source_url="desktop",
                  source_title="t", content_hash=content_hash, source_fingerprint="",
                  extraction_quality={}, messages=messages, metadata_json={},
                  message_count=len(messages))
    session.add(cap)
    session.commit()
    return cap


def _msgs(n, start=0):
    return [{"role": "user" if i % 2 == 0 else "assistant",
             "content": f"消息内容{i}", "index": i} for i in range(start, start + n)]


def _seg_resp(start, end, score=0.8):
    return {"segments": [{"start_index": start, "end_index": end, "title": "t",
                          "scenario": "planning", "summary": "s", "value_score": score}]}


def _atom_resp(start, end):
    return {"atoms": [{"atom_type": "preference", "dimension": "working_style",
                       "content": "偏好先规划后实现", "confidence": 0.8,
                       "evidence_start": start, "evidence_end": end}]}


def test_first_digest_creates_run_segments_atoms(db_session):
    cap = _make_capture(db_session, _msgs(4))
    llm = FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)])
    run = digest_capture(db_session, cap.id, llm, FakeEmbedder(), run_type="digest")
    assert run.status == "succeeded" and run.diff_type == "new"
    assert db_session.query(pm.TaskSegment).count() == 1
    atom = db_session.query(pm.MemoryAtom).one()
    assert atom.status == "pending" and atom.embedding == [0.1] * 4


def test_same_content_hash_is_idempotent(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    run2 = digest_capture(db_session, cap.id, FakeLLM([]), FakeEmbedder(), run_type="digest")
    assert run2.diff_type == "noop"
    assert db_session.query(pm.MemoryAtom).count() == 1  # 原子数不变


def test_append_only_digests_only_new_range(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    cap.messages = _msgs(8)
    cap.content_hash = "hash-2"
    db_session.commit()
    llm = FakeLLM([_seg_resp(4, 7), _atom_resp(4, 5)])
    run = digest_capture(db_session, cap.id, llm, FakeEmbedder(), run_type="digest")
    assert run.diff_type == "append_only"
    # 旧 segment 仍 active；新 segment 增加
    assert db_session.query(pm.TaskSegment).filter_by(status="active").count() == 2
    # LLM 只看到了带 buffer 的尾部，而不是全量 8 条
    assert "[0]" not in llm.prompts[0]


def test_modified_supersedes_old_artifacts(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    changed = _msgs(4)
    changed[1]["content"] = "被修改的内容"
    cap.messages = changed
    cap.content_hash = "hash-3"
    db_session.commit()
    run = digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                         FakeEmbedder(), run_type="digest")
    assert run.diff_type == "modified"
    assert db_session.query(pm.TaskSegment).filter_by(status="superseded").count() == 1
    assert db_session.query(pm.MemoryAtom).filter_by(status="superseded").count() == 1
    assert db_session.query(pm.MemoryAtom).filter_by(status="pending").count() == 1
```

- [ ] **Step 12.2 跑测试确认失败**
- [ ] **Step 12.3 实现**

```python
# app/profile/digest.py
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Capture
from app.profile import models as pm
from app.profile.cleaning import clean_messages
from app.profile.diff import compute_message_hashes, diff_hashes
from app.profile.distiller import distill_segment
from app.profile.segmenter import split_segments

PIPELINE_VERSION = "v1"
_CONTEXT_BUFFER_SEGMENTS = 2  # append_only 时向前多带的旧 segment 数


def _last_successful_run(session: Session, capture_id: UUID) -> pm.AnalysisRun | None:
    return session.execute(
        select(pm.AnalysisRun)
        .where(pm.AnalysisRun.capture_id == capture_id, pm.AnalysisRun.status == "succeeded")
        .order_by(pm.AnalysisRun.created_at.desc()).limit(1)
    ).scalar_one_or_none()


def _buffer_start(session: Session, capture_id: UUID, new_start: int) -> int:
    """append_only：从倒数第 N 个 active segment 的起点开始重看（上下文 buffer）。"""
    rows = session.execute(
        select(pm.TaskSegment.start_index)
        .where(pm.TaskSegment.capture_id == capture_id, pm.TaskSegment.status == "active")
        .order_by(pm.TaskSegment.end_index.desc()).limit(_CONTEXT_BUFFER_SEGMENTS)
    ).scalars().all()
    return min(rows[-1], new_start) if rows else new_start


def _supersede_all(session: Session, capture_id: UUID) -> None:
    for seg in session.execute(select(pm.TaskSegment).where(
            pm.TaskSegment.capture_id == capture_id,
            pm.TaskSegment.status == "active")).scalars():
        seg.status = "superseded"
    for atom in session.execute(select(pm.MemoryAtom).where(
            pm.MemoryAtom.capture_id == capture_id,
            pm.MemoryAtom.status.in_(("pending", "fused")))).scalars():
        atom.status = "superseded"


def digest_capture(session: Session, capture_id: UUID, llm, embedder,
                   run_type: str = "digest", value_threshold: float = 0.3,
                   pipeline_version: str = PIPELINE_VERSION) -> pm.AnalysisRun:
    capture = session.get(Capture, capture_id)
    if capture is None:
        raise ValueError(f"capture {capture_id} not found")

    # 幂等：同 (capture, content_hash, pipeline) 已成功 → 直接返回
    existing = session.execute(
        select(pm.AnalysisRun).where(
            pm.AnalysisRun.capture_id == capture_id,
            pm.AnalysisRun.content_hash == capture.content_hash,
            pm.AnalysisRun.pipeline_version == pipeline_version,
            pm.AnalysisRun.status == "succeeded")
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    new_hashes = compute_message_hashes(capture.messages)
    last = _last_successful_run(session, capture_id)
    diff = diff_hashes(last.message_hashes if last else None, new_hashes)

    run = pm.AnalysisRun(user_id=capture.user_id, capture_id=capture_id,
                         content_hash=capture.content_hash, pipeline_version=pipeline_version,
                         run_type=run_type, diff_type=diff.diff_type,
                         message_hashes=new_hashes, status="running",
                         started_at=datetime.now(timezone.utc))
    session.add(run)
    session.flush()

    try:
        if diff.diff_type == "noop":
            run.status, run.finished_at = "succeeded", datetime.now(timezone.utc)
            session.commit()
            return run

        if diff.diff_type == "modified":
            _supersede_all(session, capture_id)
            window_start = 0
        elif diff.diff_type == "append_only":
            window_start = _buffer_start(session, capture_id, diff.new_start)
        else:  # new
            window_start = 0

        cleaned = [m for m in clean_messages(capture.messages) if m.index >= window_start]
        run.digested_range = {"start": window_start, "end": len(capture.messages) - 1}

        segments = split_segments(cleaned, llm)
        for draft in segments:
            seg_row = pm.TaskSegment(user_id=capture.user_id, capture_id=capture_id,
                                     analysis_run_id=run.id, start_index=draft.start_index,
                                     end_index=draft.end_index, title=draft.title,
                                     scenario=draft.scenario, summary=draft.summary,
                                     value_score=draft.value_score)
            session.add(seg_row)
            session.flush()
            atoms = distill_segment(draft, cleaned, llm, value_threshold=value_threshold)
            texts = [a.content for a in atoms]
            vectors = embedder.embed(texts) if texts else []
            for atom, vec in zip(atoms, vectors):
                session.add(pm.MemoryAtom(
                    user_id=capture.user_id, segment_id=seg_row.id, capture_id=capture_id,
                    atom_type=atom.atom_type, dimension=atom.dimension, content=atom.content,
                    confidence=atom.confidence, evidence_start=atom.evidence_start,
                    evidence_end=atom.evidence_end, status="pending", embedding=vec))
            seg_vec = embedder.embed([f"{draft.title}\n{draft.summary}"])
            seg_row.embedding = seg_vec[0]

        run.status, run.finished_at = "succeeded", datetime.now(timezone.utc)
        session.commit()
        return run
    except Exception as exc:
        session.rollback()
        run = session.merge(run)
        run.status, run.error = "failed", str(exc)[:2000]
        run.finished_at = datetime.now(timezone.utc)
        session.commit()
        raise
```

- [ ] **Step 12.4 跑测试确认通过**（4 个用例覆盖 new/noop/append_only/modified 四分支）
- [ ] **Step 12.5 提交**：`git commit -m "feat(profile): digest orchestrator with idempotency and supersede"`

---

### Task 13: 队列 + worker + 启动对账

**Files:**
- Create: `api-server/app/profile/queue.py`
- Modify: `api-server/app/main.py`（lifespan）
- Test: `api-server/tests/profile/test_queue.py`

- [ ] **Step 13.1 写失败测试**

```python
# tests/profile/test_queue.py
import asyncio
from uuid import uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from app.profile.queue import ProfileWorker
from tests.profile.test_digest import FakeEmbedder, _make_capture, _msgs, _seg_resp, _atom_resp
from tests.profile.test_segmenter import FakeLLM
from app.profile import models as pm


@pytest.mark.anyio
async def test_worker_digests_enqueued_capture(engine, db_session):
    cap = _make_capture(db_session, _msgs(4))
    factory = sessionmaker(bind=engine)
    worker = ProfileWorker(session_factory=factory,
                           llm=FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                           embedder=FakeEmbedder())
    await worker.start()
    await worker.enqueue(cap.id)
    await worker.drain()      # 测试辅助：等队列清空
    await worker.stop()
    with factory() as s:
        assert s.query(pm.AnalysisRun).filter_by(status="succeeded").count() == 1


@pytest.mark.anyio
async def test_reconcile_enqueues_unprocessed_captures(engine, db_session):
    cap = _make_capture(db_session, _msgs(4))
    factory = sessionmaker(bind=engine)
    worker = ProfileWorker(session_factory=factory,
                           llm=FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                           embedder=FakeEmbedder())
    await worker.start()
    enqueued = await worker.reconcile()
    assert enqueued == 1
    await worker.drain()
    await worker.stop()


@pytest.mark.anyio
async def test_digest_failure_does_not_kill_worker(engine, db_session):
    cap1 = _make_capture(db_session, _msgs(4))
    cap2 = _make_capture(db_session, _msgs(4), content_hash="hash-x")
    factory = sessionmaker(bind=engine)

    class ExplodingLLM:
        def __init__(self):
            self.inner = FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)])
            self.first = True
        def chat_json(self, *a, **kw):
            if self.first:
                self.first = False
                raise RuntimeError("llm down")
            return self.inner.chat_json(*a, **kw)

    worker = ProfileWorker(session_factory=factory, llm=ExplodingLLM(), embedder=FakeEmbedder())
    await worker.start()
    await worker.enqueue(cap1.id)
    await worker.enqueue(cap2.id)
    await worker.drain()
    await worker.stop()
    with factory() as s:
        assert s.query(pm.AnalysisRun).filter_by(status="failed").count() == 1
        assert s.query(pm.AnalysisRun).filter_by(status="succeeded").count() == 1
```

注：`pytest.mark.anyio` 需要 dev 依赖 `anyio`（fastapi 已带）。conftest 增加：

```python
@pytest.fixture
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 13.2 跑测试确认失败**
- [ ] **Step 13.3 实现**

```python
# app/profile/queue.py
import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import Capture
from app.profile import models as pm
from app.profile.digest import digest_capture

logger = logging.getLogger(__name__)


class ProfileWorker:
    def __init__(self, session_factory: sessionmaker[Session], llm, embedder,
                 value_threshold: float = 0.3):
        self._factory = session_factory
        self._llm, self._embedder = llm, embedder
        self._threshold = value_threshold
        self._queue: asyncio.Queue[UUID] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._consume())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def enqueue(self, capture_id: UUID) -> None:
        await self._queue.put(capture_id)

    def enqueue_nowait(self, capture_id: UUID) -> None:
        self._queue.put_nowait(capture_id)

    async def drain(self) -> None:
        await self._queue.join()

    async def reconcile(self) -> int:
        """启动对账：最新内容没有成功 Analysis Run 的 capture 全部入队。"""
        def _find() -> list[UUID]:
            with self._factory() as session:
                done = select(pm.AnalysisRun.capture_id).where(
                    pm.AnalysisRun.status == "succeeded",
                    pm.AnalysisRun.content_hash == Capture.content_hash,
                    pm.AnalysisRun.capture_id == Capture.id,
                ).exists()
                rows = session.execute(select(Capture.id).where(~done)).scalars().all()
                return list(rows)
        ids = await asyncio.to_thread(_find)
        for cid in ids:
            await self.enqueue(cid)
        return len(ids)

    async def _consume(self) -> None:
        while True:
            capture_id = await self._queue.get()
            try:
                await asyncio.to_thread(self._digest_one, capture_id)
            except Exception:
                logger.exception("digest failed for capture %s", capture_id)
            finally:
                self._queue.task_done()

    def _digest_one(self, capture_id: UUID) -> None:
        with self._factory() as session:
            digest_capture(session, capture_id, self._llm, self._embedder,
                           value_threshold=self._threshold)
```

- [ ] **Step 13.4 main.py 接入 lifespan**（flag 关闭时完全不启动；构造真实 LLM/Embedding client）

```python
# app/main.py 改造要点（保持 create_app 签名向后兼容）
from contextlib import asynccontextmanager

from app.db import build_session_factory


def create_app(supabase_client: SupabaseRestClient | None = None,
               profile_worker=None) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        worker = profile_worker
        if worker is None and settings.profile_enabled:
            from app.profile.llm import EmbeddingClient, LLMClient
            from app.profile.queue import ProfileWorker
            worker = ProfileWorker(
                session_factory=build_session_factory(settings.database_url),
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
    # ……其余保持现状（CORS、routers、health、dependency_overrides）
```

- [ ] **Step 13.5 跑测试确认通过** + 全量回归（既有测试用 `TestClient(create_app())`，flag 默认 False，lifespan 为 no-op，不应破坏任何用例）
- [ ] **Step 13.6 提交**：`git commit -m "feat(profile): async digest worker with startup reconcile"`

---

### Task 14: capture 入库钩子（spec: cloud-mode-api-server delta）

**Files:**
- Modify: `api-server/app/routes/captures.py`（`create_capture` 末尾）
- Test: `api-server/tests/profile/test_capture_hook.py`

- [ ] **Step 14.1 写失败测试**

```python
# tests/profile/test_capture_hook.py
from app.routes.captures import enqueue_digest


class _Worker:
    def __init__(self):
        self.enqueued = []
    def enqueue_nowait(self, cid):
        self.enqueued.append(cid)


class _Request:
    def __init__(self, worker):
        class _App:  # 模拟 request.app.state
            class state:
                profile_worker = worker
        self.app = _App()


def test_enqueue_digest_forwards_to_worker():
    worker = _Worker()
    enqueue_digest(_Request(worker), "cap-1")
    assert worker.enqueued == ["cap-1"]


def test_enqueue_digest_noop_when_worker_absent():
    enqueue_digest(_Request(None), "cap-1")  # 不抛异常即通过


def test_enqueue_digest_swallows_errors():
    class Boom:
        def enqueue_nowait(self, cid):
            raise RuntimeError("queue full")
    enqueue_digest(_Request(Boom()), "cap-1")  # 不抛异常即通过
```

- [ ] **Step 14.2 跑测试确认失败**
- [ ] **Step 14.3 实现**：`app/routes/captures.py` 增加辅助函数并在 `create_capture` 成功路径调用（`fastapi` 的 `Request` 注入）：

```python
from fastapi import Request  # 顶部 import 追加


def enqueue_digest(request: Request, capture_id: str) -> None:
    """Fire-and-forget：分析入队失败绝不影响上传响应（spec: cloud-mode-api-server delta）。"""
    try:
        worker = getattr(request.app.state, "profile_worker", None)
        if worker is not None:
            worker.enqueue_nowait(capture_id)
    except Exception:
        pass


# create_capture 签名追加 request: Request 参数；return 前插入：
#     enqueue_digest(request, str(row["id"]))
```

- [ ] **Step 14.4 跑测试确认通过** + 全量回归（`uv run pytest -v` 全绿）
- [ ] **Step 14.5 提交**：`git commit -m "feat(profile): enqueue digest hook on capture upsert"`

---

## Self-Review 记录（writing-plans 自检）

1. **Spec 覆盖**（profile-digest 6 条 Requirement）：入队解耦→Task 13/14；清洗脱敏→Task 5/8（出口脱敏在 9/10 的 prompt 构造处断言）；切分→Task 9；蒸馏→Task 10；增量 diff→Task 11/12；幂等+对账→Task 12/13。回填触发（profile-digest R6 / query-api R6）属 Plan 2 的 API 任务，已在 Plan 2 范围注明。
2. **占位符扫描**：无 TBD/TODO；main.py 改造段落以"改造要点"给出，因 create_app 其余行保持原样（照抄现状非占位）。
3. **类型一致性**：FakeLLM duck-type 与 LLMClient.chat_json 签名一致；FakeEmbedder 与 EmbeddingClient.embed 一致；AtomDraft 字段在 digest_capture 中逐一对应。
4. **已知偏差**：`message_hashes` 取自分析层自算（compute_message_hashes）而非 captures.metadata 既有值——理由：自算口径与清洗无关、对所有平台一致；metadata 里的 hash 口径不可控。此偏差已在 spec 主轴"决策与归档"补记。

