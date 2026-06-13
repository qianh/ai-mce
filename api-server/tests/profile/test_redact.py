from app.profile.redact import redact


def test_redacts_known_secret_shapes():
    text = (
        "export OPENAI_API_KEY=sk-abc123DEF456ghi789jkl\n"
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ25hdHVyZQ\n"
        "password = hunter2secret\n"
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n"
        "supabase service key sb_" "secret_FAKE_TEST_0000000000000000"
    )
    out = redact(text)
    assert "sk-abc123DEF456ghi789jkl" not in out
    assert "hunter2secret" not in out
    assert "BEGIN RSA PRIVATE KEY" not in out
    assert "sb_secret_" not in out
    assert "eyJhbGciOiJIUzI1NiJ9" not in out
    assert "[REDACTED:api_key]" in out and "[REDACTED:password]" in out


def test_keeps_normal_code_untouched():
    text = "def hash_password(p): return sha256(p).hexdigest()  # 讨论密码哈希实现"
    assert redact(text) == text
