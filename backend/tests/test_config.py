import importlib
from pathlib import Path

import pytest

from app.core.config import BACKEND_DIR, ConfigError, build_settings


def test_default_values_load_correctly():
    settings = build_settings({}, load_env_file=False)

    assert settings.app_env == "local"
    assert settings.debug is False
    assert settings.auth_mode == "disabled"
    assert settings.api_docs_enabled is True
    assert settings.chroma_persist_dir == (BACKEND_DIR / "chroma_store").resolve()
    assert settings.chroma_collection_name == "docmind_chunks"
    assert settings.max_upload_bytes == 25 * 1024 * 1024
    assert settings.allowed_file_types == frozenset({".pdf", ".docx", ".txt"})
    assert settings.retrieval_top_k == 5


def test_environment_variables_override_defaults(tmp_path):
    env = {
        "APP_ENV": "staging",
        "DEBUG": "true",
        "AUTH_MODE": "disabled",
        "API_DOCS_ENABLED": "false",
        "DOCMIND_API_KEY": "demo-secret",
        "CHROMA_PERSIST_DIR": str(tmp_path / "vectors"),
        "CHROMA_COLLECTION_NAME": "custom_chunks",
        "UPLOAD_DIR": str(tmp_path / "uploads"),
        "MAX_UPLOAD_BYTES": "1234",
        "ALLOWED_FILE_TYPES": "pdf,txt",
        "CORS_ORIGINS": "http://localhost:5173,https://example.com",
        "GEMINI_API_KEY": "gemini-secret",
        "LLM_MODEL_NAME": "gemini-test",
        "EMBEDDING_MODEL_NAME": "embedding-test",
        "EMBEDDING_DIMENSION": "12",
        "RETRIEVAL_TOP_K": "7",
        "FULL_DOCUMENT_MAX_CHUNKS": "11",
        "LLM_TIMEOUT_SECONDS": "9.5",
        "EMBEDDING_TIMEOUT_SECONDS": "12.5",
        "PROVIDER_RETRY_COUNT": "2",
        "HF_SPACE": "yes",
    }

    settings = build_settings(env, load_env_file=False)

    assert settings.app_env == "staging"
    assert settings.debug is True
    assert settings.auth_mode == "disabled"
    assert settings.api_docs_enabled is False
    assert settings.docmind_api_key == "demo-secret"
    assert settings.chroma_collection_name == "custom_chunks"
    assert settings.allowed_file_types == frozenset({".pdf", ".txt"})
    assert settings.cors_origins == ("http://localhost:5173", "https://example.com")
    assert settings.has_llm_api_key is True
    assert settings.llm_model_name == "gemini-test"
    assert settings.embedding_model_name == "embedding-test"
    assert settings.embedding_dimension == 12
    assert settings.retrieval_top_k == 7
    assert settings.full_document_max_chunks == 11
    assert settings.llm_timeout_seconds == 9.5
    assert settings.embedding_timeout_seconds == 12.5
    assert settings.provider_retry_count == 2
    assert settings.hf_space is True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("true", True),
        ("1", True),
        ("yes", True),
        ("false", False),
        ("0", False),
        ("no", False),
    ],
)
def test_boolean_parsing(raw, expected):
    assert build_settings({"DEBUG": raw}, load_env_file=False).debug is expected


def test_integer_parsing():
    settings = build_settings({"MAX_UPLOAD_BYTES": "99", "RETRIEVAL_TOP_K": "3"}, load_env_file=False)

    assert settings.max_upload_bytes == 99
    assert settings.retrieval_top_k == 3


def test_cors_origin_parsing():
    settings = build_settings(
        {"CORS_ORIGINS": "http://localhost:5173, https://app.example"},
        load_env_file=False,
    )

    assert settings.cors_origins == ("http://localhost:5173", "https://app.example")


def test_relative_chroma_path_resolves_from_backend_dir():
    settings = build_settings({"CHROMA_PERSIST_DIR": "./data/chroma"}, load_env_file=False)

    assert settings.chroma_persist_dir == (BACKEND_DIR / "data/chroma").resolve()


def test_absolute_chroma_path_is_preserved(tmp_path):
    settings = build_settings({"CHROMA_PERSIST_DIR": str(tmp_path)}, load_env_file=False)

    assert settings.chroma_persist_dir == tmp_path.resolve()


@pytest.mark.parametrize("value", ["0", "-1", "not-an-int"])
def test_invalid_upload_limit_is_rejected(value):
    with pytest.raises(ConfigError):
        build_settings({"MAX_UPLOAD_BYTES": value}, load_env_file=False)


@pytest.mark.parametrize("value", ["0", "-1", "not-an-int"])
def test_invalid_retrieval_top_k_is_rejected(value):
    with pytest.raises(ConfigError):
        build_settings({"RETRIEVAL_TOP_K": value}, load_env_file=False)


@pytest.mark.parametrize("name", ["LLM_TIMEOUT_SECONDS", "EMBEDDING_TIMEOUT_SECONDS"])
@pytest.mark.parametrize("value", ["0", "-1", "not-a-number"])
def test_invalid_timeout_is_rejected(name, value):
    with pytest.raises(ConfigError):
        build_settings({name: value}, load_env_file=False)


def test_invalid_auth_mode_is_rejected():
    with pytest.raises(ConfigError):
        build_settings({"AUTH_MODE": "session"}, load_env_file=False)


def test_missing_optional_secrets_do_not_crash_local_configuration():
    settings = build_settings({}, load_env_file=False)

    assert settings.docmind_api_key is None
    assert settings.has_llm_api_key is False


def test_api_key_mode_requires_api_key():
    with pytest.raises(ConfigError):
        build_settings({"AUTH_MODE": "api_key"}, load_env_file=False)


def test_blank_api_key_in_api_key_mode_is_rejected():
    with pytest.raises(ConfigError):
        build_settings({"AUTH_MODE": "api_key", "DOCMIND_API_KEY": "   "}, load_env_file=False)


def test_production_without_explicit_auth_mode_fails_safe():
    with pytest.raises(ConfigError):
        build_settings({"APP_ENV": "production"}, load_env_file=False)


def test_production_docs_disabled_by_default_when_auth_disabled():
    settings = build_settings({"APP_ENV": "production", "AUTH_MODE": "disabled"}, load_env_file=False)

    assert settings.api_docs_enabled is False


def test_configuration_works_when_cwd_changes(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    settings = build_settings({"CHROMA_PERSIST_DIR": "./data/chroma"}, load_env_file=False)

    assert settings.chroma_persist_dir == (BACKEND_DIR / "data/chroma").resolve()


def test_application_imports_when_cwd_changes(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("AUTH_MODE", "disabled")
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "26214400")
    monkeypatch.setenv("RETRIEVAL_TOP_K", "5")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "30")
    monkeypatch.setenv("EMBEDDING_TIMEOUT_SECONDS", "60")

    module = importlib.import_module("app.api.main")

    assert module.app.title == "DocMind API"


def test_secret_values_are_not_in_repr():
    settings = build_settings(
        {
            "DOCMIND_API_KEY": "docmind-secret-value",
            "GEMINI_API_KEY": "gemini-secret-value",
            "GOOGLE_API_KEY": "google-secret-value",
            "GROQ_API_KEY": "groq-secret-value",
        },
        load_env_file=False,
    )

    rendered = repr(settings)

    assert "docmind-secret-value" not in rendered
    assert "gemini-secret-value" not in rendered
    assert "google-secret-value" not in rendered
    assert "groq-secret-value" not in rendered
    assert "has_docmind_api_key=True" in rendered
    assert "has_llm_api_key=True" in rendered
