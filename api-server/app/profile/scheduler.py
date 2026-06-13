import logging
from uuid import UUID

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import distinct, select
from sqlalchemy.orm import Session, sessionmaker

from app.profile import models as pm
from app.profile.dream import run_dream_cycle

logger = logging.getLogger(__name__)


def build_dream_trigger(cron: str) -> CronTrigger:
    return CronTrigger.from_crontab(cron)


def find_dream_users(session: Session) -> list[UUID]:
    """有任何记忆原子的用户都参与做梦（run_dream_cycle 自身按日幂等且空跑廉价）。"""
    return list(session.execute(select(distinct(pm.MemoryAtom.user_id))).scalars().all())


def run_dream_for_all(session_factory: sessionmaker, llm, embedder) -> int:
    with session_factory() as session:
        users = find_dream_users(session)
    done = 0
    for user_id in users:
        try:
            with session_factory() as session:
                run_dream_cycle(session, user_id, llm, embedder)
            done += 1
        except Exception:
            logger.exception("dream cycle failed for user %s", user_id)
    return done
