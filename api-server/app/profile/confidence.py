import math
from dataclasses import dataclass

_DECAY_HALF_DAYS = 180.0
_CONFIRMED_FLOOR = 0.95


@dataclass(frozen=True)
class Evidence:
    polarity: str       # supporting | contradicting
    weight: float
    age_days: float


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def recalculate_confidence(evidences: list[Evidence], *, user_confirmed: bool) -> float:
    if user_confirmed:
        return _CONFIRMED_FLOOR
    support = sum(e.weight * math.exp(-e.age_days / _DECAY_HALF_DAYS)
                  for e in evidences if e.polarity == "supporting")
    if support <= 0:
        return 0.0
    contra = sum(e.weight * math.exp(-e.age_days / _DECAY_HALF_DAYS)
                 for e in evidences if e.polarity == "contradicting")
    score = support - contra
    if score <= 0:
        return 0.0
    # sigmoid 压到 (0,1)：1 条新鲜证据 ≈ 0.46，3 条 ≈ 0.82
    return 1.0 - math.exp(-0.62 * score)
