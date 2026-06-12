from app.profile.diff import DiffResult, compute_message_hashes, diff_hashes


def test_compute_message_hashes_is_stable():
    msgs = [{"role": "user", "content": "a", "index": 0}]
    assert compute_message_hashes(msgs) == compute_message_hashes(msgs)


def test_noop_when_identical():
    old = ["h1", "h2", "h3"]
    assert diff_hashes(old, old) == DiffResult(diff_type="noop", new_start=None)


def test_append_only_detects_new_range_start():
    out = diff_hashes(["h1", "h2"], ["h1", "h2", "h3", "h4"])
    assert out.diff_type == "append_only" and out.new_start == 2


def test_modified_when_prefix_broken():
    out = diff_hashes(["h1", "h2", "h3"], ["h1", "hX", "h3"])
    assert out.diff_type == "modified" and out.new_start is None


def test_new_when_no_previous():
    out = diff_hashes(None, ["h1"])
    assert out.diff_type == "new"
