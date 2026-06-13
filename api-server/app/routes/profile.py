from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Capture
from app.profile import models as pm
from app.profile.confidence import cosine
from app.routes.captures import current_user_id

router = APIRouter(prefix="/v1/profile", tags=["profile"])

_HIDDEN_STATUSES = ("deprecated", "user_rejected")
_CONFIRMED_CONFIDENCE = 0.95


def get_db_session() -> Generator[Session, None, None]:
    yield from get_db()


class BriefResponse(BaseModel):
    version: int
    content: str
    source_claim_ids: list[str]
    created_at: datetime


class ClaimItem(BaseModel):
    id: str
    dimension: str
    project_key: str | None
    claim: str
    confidence: float
    status: str
    evidence_count: int


class EvidenceItem(BaseModel):
    atom_id: str
    atom_content: str
    polarity: str
    status: str
    capture_id: str
    capture_title: str | None
    evidence_range: list[int] | None


class CalibrationRequest(BaseModel):
    claim_id: UUID
    action: Literal["confirm", "reject", "correct"]
    corrected_text: str | None = None
    note: str | None = None


class BackfillRequest(BaseModel):
    days: int = 90


def _claim_item(row: pm.ProfileClaim) -> ClaimItem:
    return ClaimItem(id=str(row.id), dimension=row.dimension, project_key=row.project_key,
                     claim=row.claim, confidence=row.confidence, status=row.status,
                     evidence_count=row.evidence_count)


@router.get("/brief", response_model=BriefResponse)
def get_brief(user_id: str = Depends(current_user_id),
              session: Session = Depends(get_db_session)) -> BriefResponse:
    brief = session.execute(
        select(pm.UserBrief).where(pm.UserBrief.user_id == UUID(user_id))
        .order_by(pm.UserBrief.version.desc()).limit(1)).scalars().first()
    if brief is None:
        raise HTTPException(status_code=404, detail="No user brief yet")
    return BriefResponse(version=brief.version, content=brief.content,
                         source_claim_ids=[str(x) for x in brief.source_claim_ids],
                         created_at=brief.created_at)


@router.get("/claims", response_model=list[ClaimItem])
def list_claims(request: Request,
                dimension: str | None = Query(default=None),
                project: str | None = Query(default=None),
                q: str | None = Query(default=None),
                limit: int = Query(default=20, ge=1, le=100),
                user_id: str = Depends(current_user_id),
                session: Session = Depends(get_db_session)) -> list[ClaimItem]:
    stmt = select(pm.ProfileClaim).where(
        pm.ProfileClaim.user_id == UUID(user_id),
        pm.ProfileClaim.status.notin_(_HIDDEN_STATUSES))
    if dimension:
        stmt = stmt.where(pm.ProfileClaim.dimension == dimension)
    if project:
        stmt = stmt.where(pm.ProfileClaim.project_key == project)
    rows = list(session.execute(stmt).scalars().all())
    if q:
        worker = getattr(request.app.state, "profile_worker", None)
        if worker is None or getattr(worker, "embedder", None) is None:
            raise HTTPException(status_code=503, detail="Semantic search unavailable")
        query_vec = worker.embedder.embed([q])[0]
        rows.sort(key=lambda r: cosine(query_vec, r.embedding or []), reverse=True)
    else:
        rows.sort(key=lambda r: r.confidence, reverse=True)
    return [_claim_item(r) for r in rows[:limit]]


@router.get("/claims/{claim_id}/evidence", response_model=list[EvidenceItem])
def claim_evidence(claim_id: UUID,
                   user_id: str = Depends(current_user_id),
                   session: Session = Depends(get_db_session)) -> list[EvidenceItem]:
    claim = session.get(pm.ProfileClaim, claim_id)
    if claim is None or claim.user_id != UUID(user_id):
        raise HTTPException(status_code=404, detail="Claim not found")
    out: list[EvidenceItem] = []
    for ev in session.execute(select(pm.ClaimEvidence)
                              .where(pm.ClaimEvidence.claim_id == claim_id)).scalars():
        atom = session.get(pm.MemoryAtom, ev.atom_id)
        if atom is None:
            continue
        capture = session.get(Capture, atom.capture_id)
        rng = None
        if atom.evidence_start is not None and atom.evidence_end is not None:
            rng = [atom.evidence_start, atom.evidence_end]
        out.append(EvidenceItem(atom_id=str(atom.id), atom_content=atom.content,
                                polarity=ev.polarity, status=ev.status,
                                capture_id=str(atom.capture_id),
                                capture_title=capture.source_title if capture else None,
                                evidence_range=rng))
    return out


@router.post("/calibrations")
def calibrate(req: CalibrationRequest,
              user_id: str = Depends(current_user_id),
              session: Session = Depends(get_db_session)) -> dict:
    if req.action == "correct" and not req.corrected_text:
        raise HTTPException(status_code=422, detail="corrected_text required for correct")
    claim = session.get(pm.ProfileClaim, req.claim_id)
    if claim is None or claim.user_id != UUID(user_id):
        raise HTTPException(status_code=404, detail="Claim not found")
    if req.action == "confirm":
        claim.status = "user_confirmed"
        claim.confidence = max(claim.confidence, _CONFIRMED_CONFIDENCE)
    elif req.action == "reject":
        claim.status = "user_rejected"
    else:  # correct
        claim.claim = req.corrected_text
        claim.status = "user_confirmed"
        claim.confidence = max(claim.confidence, _CONFIRMED_CONFIDENCE)
    session.add(pm.Calibration(user_id=UUID(user_id), claim_id=claim.id, action=req.action,
                               corrected_text=req.corrected_text, note=req.note))
    session.commit()
    return {"id": str(claim.id), "status": claim.status, "confidence": claim.confidence}


@router.get("/dreams/latest")
def latest_dream(user_id: str = Depends(current_user_id),
                 session: Session = Depends(get_db_session)) -> dict:
    run = session.execute(
        select(pm.DreamRun).where(pm.DreamRun.user_id == UUID(user_id),
                                  pm.DreamRun.status == "succeeded")
        .order_by(pm.DreamRun.created_at.desc()).limit(1)).scalars().first()
    if run is None:
        raise HTTPException(status_code=404, detail="No dream run yet")
    return {"id": str(run.id), "started_at": run.started_at, "finished_at": run.finished_at,
            "stats": run.stats}


@router.post("/backfill")
def backfill(req: BackfillRequest, request: Request,
             user_id: str = Depends(current_user_id),
             session: Session = Depends(get_db_session)) -> dict:
    worker = getattr(request.app.state, "profile_worker", None)
    if worker is None:
        raise HTTPException(status_code=503, detail="Profile pipeline disabled")
    cutoff = datetime.now(timezone.utc) - timedelta(days=req.days)
    digested = (
        select(pm.AnalysisRun.id)
        .where(pm.AnalysisRun.status == "succeeded",
               pm.AnalysisRun.capture_id == Capture.id,
               pm.AnalysisRun.content_hash == Capture.content_hash)
        .exists())
    rows = session.execute(
        select(Capture.id).where(Capture.user_id == UUID(user_id),
                                 Capture.created_at >= cutoff, ~digested)
        .order_by(Capture.created_at.desc())).scalars().all()
    for cid in rows:
        worker.enqueue_nowait(str(cid))
    return {"enqueued": len(rows)}
