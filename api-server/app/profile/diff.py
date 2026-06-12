import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class DiffResult:
    diff_type: str            # new | noop | append_only | modified
    new_start: int | None     # append_only 时：新增区间起始消息位置（列表位置）


def compute_message_hashes(messages: list[dict]) -> list[str]:
    return [
        hashlib.sha256(f"{m.get('role', '')}\x00{(m.get('content') or '').strip()}".encode()).hexdigest()
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
