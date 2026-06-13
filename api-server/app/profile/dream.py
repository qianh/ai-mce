from datetime import date, datetime, timezone
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.profile import models as pm
from app.profile.confidence import Evidence, cosine, recalculate_confidence

_ATTACH_SIMILARITY = 0.55   # atom 与 claim 进入 LLM 裁决的余弦门槛
_REJECTED_SIMILARITY = 0.90  # 与 user_rejected claim 语义等价 → 不复活
_DEPRECATE_THRESHOLD = 0.05
_ACTIVATE_THRESHOLD = 0.50

_SYSTEM = """你是画像融合裁决器。对每个记忆原子，判断它应归入哪个既有画像断言（attach），
还是构成一个新断言（new）。attach 时给出 claim_id 与 polarity（supporting 支持 / contradicting 矛盾）。
只输出 JSON：{"decisions": [{"atom_id", "action", "claim_id", "polarity"}]}"""


class _Decision(BaseModel):
    atom_id: str
    action: str                      # attach | new
    claim_id: str | None = None
    polarity: str = "supporting"     # supporting | contradicting


class _DecisionList(BaseModel):
    decisions: list[_Decision]


def _today_run(session: Session, user_id: UUID, today: date) -> pm.DreamRun | None:
    for run in session.execute(
            select(pm.DreamRun).where(pm.DreamRun.user_id == user_id,
                                      pm.DreamRun.status == "succeeded")).scalars():
        if run.started_at is not None and run.started_at.date() == today:
            return run
    return None


def _age_days(created_at: datetime | None, now: datetime) -> float:
    if created_at is None:
        return 0.0
    created = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    return max((now - created).total_seconds() / 86400.0, 0.0)


def _recalc(session: Session, claim: pm.ProfileClaim, now: datetime) -> float:
    rows = session.execute(
        select(pm.ClaimEvidence).where(pm.ClaimEvidence.claim_id == claim.id,
                                       pm.ClaimEvidence.status == "active")).scalars().all()
    evidences = [Evidence(polarity=r.polarity, weight=r.weight,
                          age_days=_age_days(r.created_at, now)) for r in rows]
    claim.evidence_count = len(rows)
    return recalculate_confidence(evidences, user_confirmed=claim.status == "user_confirmed")


def run_dream_cycle(session: Session, user_id: UUID, llm, embedder, *,
                    today: date | None = None) -> pm.DreamRun:
    now = datetime.now(timezone.utc)
    today = today or now.date()
    existing = _today_run(session, user_id, today)
    if existing is not None:
        return existing

    run = pm.DreamRun(user_id=user_id, status="running", started_at=now)
    session.add(run)
    session.flush()

    pending = session.execute(
        select(pm.MemoryAtom).where(pm.MemoryAtom.user_id == user_id,
                                    pm.MemoryAtom.status == "pending")).scalars().all()
    claims = session.execute(
        select(pm.ProfileClaim).where(
            pm.ProfileClaim.user_id == user_id,
            pm.ProfileClaim.status.notin_(("deprecated", "user_rejected")))).scalars().all()
    rejected = session.execute(
        select(pm.ProfileClaim).where(pm.ProfileClaim.user_id == user_id,
                                      pm.ProfileClaim.status == "user_rejected")).scalars().all()

    before = {c.id: c.confidence for c in claims}
    affected: set[UUID] = set()
    contradicted: set[UUID] = set()
    gained_support: set[UUID] = set()
    lost_evidence: set[UUID] = set()
    created: list[str] = []
    skipped_rejected = 0

    # 1) 旧证据失效：superseded atom 的 active 证据标记 superseded
    superseded_evidence = session.execute(
        select(pm.ClaimEvidence)
        .join(pm.MemoryAtom, pm.ClaimEvidence.atom_id == pm.MemoryAtom.id)
        .where(pm.MemoryAtom.user_id == user_id,
               pm.MemoryAtom.status == "superseded",
               pm.ClaimEvidence.status == "active")).scalars().all()
    for ev in superseded_evidence:
        ev.status = "superseded"
        affected.add(ev.claim_id)
        lost_evidence.add(ev.claim_id)

    # 2) pending atom 分流：有相似 claim → LLM 裁决；否则 new
    to_adjudicate: list[tuple[pm.MemoryAtom, list[pm.ProfileClaim]]] = []
    new_atoms: list[pm.MemoryAtom] = []
    for atom in pending:
        candidates = [c for c in claims
                      if c.dimension == atom.dimension and c.embedding and atom.embedding
                      and cosine(atom.embedding, c.embedding) > _ATTACH_SIMILARITY]
        if candidates:
            to_adjudicate.append((atom, candidates))
        else:
            new_atoms.append(atom)

    decisions: dict[str, _Decision] = {}
    if to_adjudicate:
        lines = []
        for atom, candidates in to_adjudicate:
            cands = "；".join(f"claim_id={c.id}: {c.claim}" for c in candidates)
            lines.append(f"atom_id={atom.id} 内容：{atom.content}\n  候选断言：{cands}")
        out = llm.chat_json(_SYSTEM, "\n".join(lines), _DecisionList)
        decisions = {d.atom_id: d for d in out.decisions}

    claim_by_id = {str(c.id): c for c in claims}
    for atom, _candidates in to_adjudicate:
        decision = decisions.get(str(atom.id))
        target = claim_by_id.get(decision.claim_id) if decision and decision.claim_id else None
        if decision and decision.action == "attach" and target is not None:
            polarity = decision.polarity if decision.polarity in ("supporting", "contradicting") \
                else "supporting"
            session.add(pm.ClaimEvidence(claim_id=target.id, atom_id=atom.id,
                                         polarity=polarity, weight=atom.confidence))
            affected.add(target.id)
            if polarity == "contradicting":
                contradicted.add(target.id)
            else:
                gained_support.add(target.id)
        else:
            new_atoms.append(atom)

    # 3) 新候选 claim（先过 user_rejected 不复活检查）
    for atom in new_atoms:
        if atom.embedding and any(
                r.embedding and cosine(atom.embedding, r.embedding) > _REJECTED_SIMILARITY
                for r in rejected):
            skipped_rejected += 1
            continue
        claim = pm.ProfileClaim(user_id=user_id, dimension=atom.dimension, claim=atom.content,
                                confidence=0.0, status="candidate", embedding=atom.embedding)
        session.add(claim)
        session.flush()
        session.add(pm.ClaimEvidence(claim_id=claim.id, atom_id=atom.id,
                                     polarity="supporting", weight=atom.confidence))
        claims.append(claim)
        claim_by_id[str(claim.id)] = claim
        created.append(str(claim.id))
        affected.add(claim.id)

    # 4) 受影响 claim 重算置信度 + 五种处置
    session.flush()
    changes = {"created": created, "strengthened": [], "weakened": [],
               "contradicted": [], "deprecated": [], "unchanged": []}
    for claim in claims:
        if claim.id not in affected:
            if str(claim.id) not in created:
                changes["unchanged"].append(str(claim.id))
            continue
        new_conf = _recalc(session, claim, now)
        old_conf = before.get(claim.id, 0.0)
        claim.confidence = new_conf
        claim.last_reconciled_at = now
        if str(claim.id) in created:
            pass  # created 已记录
        elif new_conf <= _DEPRECATE_THRESHOLD:
            claim.status = "deprecated"
            changes["deprecated"].append(str(claim.id))
        elif claim.id in contradicted:
            changes["contradicted"].append(str(claim.id))
        elif claim.id in gained_support and claim.id not in lost_evidence:
            changes["strengthened"].append(str(claim.id))
        elif claim.id in lost_evidence and claim.id not in gained_support:
            claim.status = "weakened" if claim.status == "active" else claim.status
            changes["weakened"].append(str(claim.id))
        elif new_conf >= old_conf:
            changes["strengthened"].append(str(claim.id))
        else:
            claim.status = "weakened" if claim.status == "active" else claim.status
            changes["weakened"].append(str(claim.id))
        if claim.status == "candidate" and new_conf >= _ACTIVATE_THRESHOLD:
            claim.status = "active"

    # 5) atom 固化
    for atom in pending:
        atom.status = "fused"
        atom.fused_at = now

    run.status = "succeeded"
    run.finished_at = datetime.now(timezone.utc)
    run.stats = {"pending_atoms": len(pending), "changes": changes,
                 "skipped_rejected_equivalents": skipped_rejected}
    session.commit()

    from app.profile.brief import compile_brief, create_snapshot

    create_snapshot(session, user_id, run, changes)
    compile_brief(session, user_id)
    return run
