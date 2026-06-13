from app.config import Settings


def test_profile_settings_defaults():
    s = Settings(_env_file=None)
    assert s.profile_enabled is False
    assert s.embedding_dim == 1024
    assert s.profile_pipeline_version == "v1"
    assert s.profile_value_threshold == 0.3


def test_profile_settings_from_env(monkeypatch):
    monkeypatch.setenv("MCE_PROFILE_ENABLED", "true")
    monkeypatch.setenv("MCE_LLM_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setenv("MCE_LLM_API_KEY", "k")
    monkeypatch.setenv("MCE_LLM_MODEL", "deepseek-chat")
    monkeypatch.setenv("MCE_EMBEDDING_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("MCE_EMBEDDING_MODEL", "bge-m3")
    s = Settings(_env_file=None)
    assert s.profile_enabled is True
    assert s.llm_model == "deepseek-chat"
    assert s.embedding_base_url.endswith("/v1")
