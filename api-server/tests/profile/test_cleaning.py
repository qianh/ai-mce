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
