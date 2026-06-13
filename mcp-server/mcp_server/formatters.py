_QUOTE_MAX = 200

_OUTCOME_LABELS = [("created", "新增"), ("strengthened", "加强"), ("weakened", "削弱"),
                   ("contradicted", "矛盾"), ("deprecated", "废弃"), ("unchanged", "不变")]


def format_brief(body: dict) -> str:
    return f"{body['content']}\n\n（用户简报 v{body['version']}，生成于 {body['created_at']}）"


def format_claims(rows: list[dict]) -> str:
    if not rows:
        return "没有匹配的画像断言。"
    lines = []
    for r in rows:
        project = f"（项目 {r['project_key']}）" if r.get("project_key") else ""
        lines.append(f"- [{r['dimension']}]{project} {r['claim']}"
                     f"（置信 {r['confidence']:.2f}，证据 {r['evidence_count']} 条，id={r['id']}）")
    return "\n".join(lines)


def format_evidence(rows: list[dict]) -> str:
    if not rows:
        return "该断言暂无证据记录。"
    lines = []
    for r in rows:
        quote = r["atom_content"]
        if len(quote) > _QUOTE_MAX:
            quote = quote[:_QUOTE_MAX] + "…"
        rng = r.get("evidence_range")
        loc = f"消息[{rng[0]}-{rng[1]}]" if rng else "区间未知"
        lines.append(f"- ({r['polarity']}/{r['status']}) {quote}\n"
                     f"  来源：《{r.get('capture_title') or '未知会话'}》{loc}")
    return "\n".join(lines)


def format_dream(body: dict) -> str:
    stats = body.get("stats") or {}
    changes = stats.get("changes") or {}
    parts = [f"{label} {len(changes.get(key) or [])}" for key, label in _OUTCOME_LABELS]
    return (f"最近一次做梦：{body.get('started_at')}\n"
            f"消化原子 {stats.get('pending_atoms', 0)} 个；claim 处置：{'，'.join(parts)}")
