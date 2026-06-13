from mcp_server import server
from mcp_server.formatters import format_brief, format_claims, format_dream, format_evidence


class FakeApi:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.responses[path]


def test_format_brief():
    out = format_brief({"version": 3, "content": "# 用户简报\n- 内容", "created_at": "2026-06-12"})
    assert "# 用户简报" in out and "v3" in out


def test_format_claims_compact():
    rows = [{"id": "c1", "dimension": "working_style", "claim": "偏好结构化",
             "confidence": 0.81, "status": "active", "evidence_count": 5,
             "project_key": None}]
    out = format_claims(rows)
    assert "偏好结构化" in out and "0.81" in out and "c1" in out


def test_format_evidence_truncates_quotes():
    rows = [{"atom_id": "a1", "atom_content": "长" * 500, "polarity": "supporting",
             "status": "active", "capture_id": "cap1", "capture_title": "某次会话",
             "evidence_range": [3, 7]}]
    out = format_evidence(rows)
    assert "某次会话" in out and "[3-7]" in out
    assert len(out) < 500  # 引文限长


def test_format_dream():
    out = format_dream({"started_at": "2026-06-12T04:00:00Z",
                        "stats": {"changes": {"created": ["a"], "strengthened": [],
                                              "weakened": [], "contradicted": [],
                                              "deprecated": ["b"], "unchanged": []},
                                  "pending_atoms": 7}})
    assert "新增 1" in out and "废弃 1" in out


def test_tools_forward_to_api():
    api = FakeApi({
        "/v1/profile/brief": {"version": 1, "content": "# B", "created_at": "x"},
        "/v1/profile/claims": [],
        "/v1/profile/claims/c1/evidence": [],
        "/v1/profile/calibrations": {"id": "c1", "status": "user_rejected", "confidence": 0.1},
        "/v1/profile/dreams/latest": {"started_at": "x", "stats": {"changes": {}}},
    })
    server._api_override(api)

    assert "# B" in server.get_user_brief()
    server.search_profile("排障习惯", dimension="problem_solving")
    method, path, kwargs = api.calls[-1]
    assert path == "/v1/profile/claims"
    assert kwargs["params"]["q"] == "排障习惯"
    assert kwargs["params"]["dimension"] == "problem_solving"

    server.get_claim_evidence("c1")
    assert api.calls[-1][1] == "/v1/profile/claims/c1/evidence"

    out = server.correct_profile("c1", "reject")
    assert "user_rejected" in out
    assert api.calls[-1][2]["json"]["action"] == "reject"

    server.get_profile_suggestions()
    assert api.calls[-1][2]["params"]["dimension"] == "ai_usage"

    server.get_dream_report()
    assert api.calls[-1][1] == "/v1/profile/dreams/latest"
