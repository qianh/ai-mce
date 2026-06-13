import math

from app.profile.confidence import Evidence, cosine, recalculate_confidence


def test_cosine_basics():
    assert cosine([1, 0], [0, 1]) == 0.0
    assert math.isclose(cosine([1, 2], [1, 2]), 1.0)
    assert cosine([0, 0], [1, 1]) == 0.0  # 零向量安全


def test_no_active_supporting_evidence_zeroes_confidence():
    assert recalculate_confidence([], user_confirmed=False) == 0.0
    only_contra = [Evidence(polarity="contradicting", weight=1.0, age_days=0)]
    assert recalculate_confidence(only_contra, user_confirmed=False) == 0.0


def test_user_confirmed_locks_high():
    assert recalculate_confidence([], user_confirmed=True) >= 0.95


def test_more_support_raises_and_decay_lowers():
    one = [Evidence("supporting", 1.0, 0)]
    three = [Evidence("supporting", 1.0, 0)] * 3
    old = [Evidence("supporting", 1.0, 365)]
    assert recalculate_confidence(three, user_confirmed=False) > recalculate_confidence(one, user_confirmed=False)
    assert recalculate_confidence(one, user_confirmed=False) > recalculate_confidence(old, user_confirmed=False)


def test_contradicting_lowers():
    sup = [Evidence("supporting", 1.0, 0)] * 2
    mixed = sup + [Evidence("contradicting", 1.0, 0)]
    assert recalculate_confidence(mixed, user_confirmed=False) < recalculate_confidence(sup, user_confirmed=False)
