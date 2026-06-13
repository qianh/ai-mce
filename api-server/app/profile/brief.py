from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.profile import models as pm
from app.profile.models import PROFILE_DIMENSIONS

_DIMENSION_TITLES = {
    "basic_info": "基础情况",
    "project_context": "项目脉络",
    "working_style": "工作方式",
    "language_style": "语言与表达习惯",
    "problem_solving": "解决问题方式",
    "skill_signal": "技能信号",
    "ai_usage": "AI 使用模式与建议",
}
_BRIEF_STATUSES = ("active", "user_confirmed")


def create_snapshot(session: Session, user_id: UUID, dream_run: pm.DreamRun,
                    changes: dict) -> pm.ProfileSnapshot:
    version = (session.execute(
        select(func.max(pm.ProfileSnapshot.version))
        .where(pm.ProfileSnapshot.user_id == user_id)).scalar() or 0) + 1
    claims = session.execute(
        select(pm.ProfileClaim).where(pm.ProfileClaim.user_id == user_id)).scalars().all()
    snapshot = pm.ProfileSnapshot(
        user_id=user_id, dream_run_id=dream_run.id, version=version,
        snapshot={"claims": [{"id": str(c.id), "dimension": c.dimension, "claim": c.claim,
                              "confidence": c.confidence, "status": c.status}
                             for c in claims]},
        changes=changes)
    session.add(snapshot)
    session.commit()
    return snapshot


def compile_brief(session: Session, user_id: UUID, *, min_confidence: float = 0.6,
                  max_chars: int = 2000) -> pm.UserBrief:
    claims = session.execute(
        select(pm.ProfileClaim)
        .where(pm.ProfileClaim.user_id == user_id,
               pm.ProfileClaim.status.in_(_BRIEF_STATUSES),
               pm.ProfileClaim.confidence >= min_confidence)
        .order_by(pm.ProfileClaim.confidence.desc())).scalars().all()

    sections: dict[str, list[pm.ProfileClaim]] = {d: [] for d in PROFILE_DIMENSIONS}
    for claim in claims:
        sections.setdefault(claim.dimension, []).append(claim)

    today = datetime.now(timezone.utc).date().isoformat()
    lines = [f"# 用户简报（{today}）", ""]
    used: list[str] = []
    for dim in PROFILE_DIMENSIONS:
        rows = sections.get(dim) or []
        if not rows:
            continue
        lines.append(f"## {_DIMENSION_TITLES[dim]}")
        for claim in rows:
            mark = "✔" if claim.status == "user_confirmed" else "·"
            lines.append(f"- {mark} {claim.claim}")
            used.append(str(claim.id))
        lines.append("")
    content = "\n".join(lines).strip()
    if len(content) > max_chars:
        content = content[: max_chars - 1] + "…"

    version = (session.execute(
        select(func.max(pm.UserBrief.version))
        .where(pm.UserBrief.user_id == user_id)).scalar() or 0) + 1
    brief = pm.UserBrief(user_id=user_id, version=version, content=content,
                         source_claim_ids=used)
    session.add(brief)
    session.commit()
    return brief
