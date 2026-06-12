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
