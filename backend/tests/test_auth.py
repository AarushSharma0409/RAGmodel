import os
import subprocess
import sys
import textwrap
from pathlib import Path

from fastapi.testclient import TestClient

from app.api import main
from app.core.config import build_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _set_auth(monkeypatch, *, mode: str, key: str | None = None):
    env = {"AUTH_MODE": mode}
    if key is not None:
        env["DOCMIND_API_KEY"] = key
    settings = build_settings(env, load_env_file=False)
    monkeypatch.setattr(main, "settings", settings)
    monkeypatch.setattr(main, "DOCMIND_API_KEY", settings.docmind_api_key or "")
    return settings


def _run_import_with_env(env_updates: dict[str, str]):
    env = os.environ.copy()
    env.update(env_updates)
    env["PYTHONPATH"] = str(BACKEND_DIR)
    script = "from app.api.main import app; print(app.title)"
    return subprocess.run(
        [sys.executable, "-c", script],
        text=True,
        capture_output=True,
        env=env,
    )


def test_disabled_mode_allows_protected_routes(monkeypatch):
    _set_auth(monkeypatch, mode="disabled")
    client = TestClient(main.app)

    response = client.get("/documents/status")

    assert response.status_code == 200


def test_disabled_mode_lifespan_emits_warning(monkeypatch, capsys):
    _set_auth(monkeypatch, mode="disabled")
    monkeypatch.setattr(main, "get_model", lambda: object())

    async def run_lifespan():
        context = main.lifespan(main.app)
        await context.__aenter__()
        await context.__aexit__(None, None, None)

    import asyncio

    asyncio.run(run_lifespan())
    captured = capsys.readouterr()

    assert "API authentication is disabled" in captured.out


def test_api_key_mode_missing_key_fails_configuration():
    result = _run_import_with_env({"APP_ENV": "local", "AUTH_MODE": "api_key", "DOCMIND_API_KEY": ""})

    assert result.returncode != 0
    assert "DOCMIND_API_KEY is required" in result.stderr


def test_disabled_mode_imports_successfully():
    result = _run_import_with_env({"APP_ENV": "local", "AUTH_MODE": "disabled", "DOCMIND_API_KEY": ""})

    assert result.returncode == 0
    assert "DocMind API" in result.stdout


def test_api_key_mode_blank_key_fails_configuration():
    result = _run_import_with_env({"APP_ENV": "local", "AUTH_MODE": "api_key", "DOCMIND_API_KEY": "   "})

    assert result.returncode != 0
    assert "DOCMIND_API_KEY is required" in result.stderr


def test_api_key_mode_valid_key_imports_successfully():
    result = _run_import_with_env({"APP_ENV": "local", "AUTH_MODE": "api_key", "DOCMIND_API_KEY": "test-secret"})

    assert result.returncode == 0
    assert "DocMind API" in result.stdout


def test_correct_key_permits_access(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    response = client.get("/documents/status", headers={"X-API-Key": "test-secret"})

    assert response.status_code == 200


def test_missing_request_key_returns_401(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    response = client.get("/documents/status")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or missing API key"}


def test_incorrect_request_key_returns_401_without_exposing_secret(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    response = client.get("/documents/status", headers={"X-API-Key": "wrong"})

    assert response.status_code == 401
    assert "test-secret" not in response.text


def test_health_routes_remain_public(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    assert client.get("/health").status_code == 200
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").status_code == 200


def test_protected_document_route_requires_authentication(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    response = client.get("/documents/")

    assert response.status_code == 401


def test_protected_query_route_requires_authentication(monkeypatch):
    _set_auth(monkeypatch, mode="api_key", key="test-secret")
    client = TestClient(main.app)

    response = client.post("/query/", json={"query": "hello"})

    assert response.status_code == 401


def test_invalid_auth_mode_fails_configuration():
    result = _run_import_with_env({"APP_ENV": "local", "AUTH_MODE": "invalid"})

    assert result.returncode != 0
    assert "AUTH_MODE must be one of" in result.stderr


def test_api_docs_disabled_by_default_in_production():
    script = textwrap.dedent(
        """
        from app.api.main import app
        print(app.docs_url)
        print(app.openapi_url)
        """
    )
    env = os.environ.copy()
    env.update({"APP_ENV": "production", "AUTH_MODE": "disabled", "PYTHONPATH": str(BACKEND_DIR)})
    result = subprocess.run([sys.executable, "-c", script], cwd=BACKEND_DIR, env=env, text=True, capture_output=True)

    assert result.returncode == 0
    assert result.stdout.splitlines() == ["None", "None"]


def test_api_docs_can_be_enabled_in_development():
    script = textwrap.dedent(
        """
        from app.api.main import app
        print(app.docs_url)
        print(app.openapi_url)
        """
    )
    env = os.environ.copy()
    env.update({"APP_ENV": "local", "AUTH_MODE": "disabled", "API_DOCS_ENABLED": "true", "PYTHONPATH": str(BACKEND_DIR)})
    result = subprocess.run([sys.executable, "-c", script], cwd=BACKEND_DIR, env=env, text=True, capture_output=True)

    assert result.returncode == 0
    assert result.stdout.splitlines() == ["/docs", "/openapi.json"]


def test_cors_allows_api_key_header_from_configured_origin():
    script = textwrap.dedent(
        """
        from fastapi.testclient import TestClient
        from app.api.main import app
        client = TestClient(app)
        response = client.options(
            "/documents/status",
            headers={
                "Origin": "https://app.example",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-API-Key",
            },
        )
        print(response.status_code)
        print(response.headers.get("access-control-allow-origin"))
        print(response.headers.get("access-control-allow-headers"))
        print(response.headers.get("access-control-allow-credentials"))
        """
    )
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "local",
            "AUTH_MODE": "api_key",
            "DOCMIND_API_KEY": "test-secret",
            "CORS_ORIGINS": "https://app.example",
            "PYTHONPATH": str(BACKEND_DIR),
        }
    )
    result = subprocess.run([sys.executable, "-c", script], cwd=BACKEND_DIR, env=env, text=True, capture_output=True)

    assert result.returncode == 0
    lines = result.stdout.splitlines()
    assert lines[0] == "200"
    assert lines[1] == "https://app.example"
    assert "X-API-Key" in lines[2]
    assert lines[3] == "true"


def test_static_routes_only_public_when_hf_static_serving_is_enabled(monkeypatch):
    monkeypatch.setattr(main, "settings", build_settings({"AUTH_MODE": "disabled"}, load_env_file=False))
    assert main._is_exempt("/assets/app.js") is False
    assert main._is_exempt("/") is False

    monkeypatch.setattr(
        main,
        "settings",
        build_settings({"AUTH_MODE": "disabled", "HF_SPACE": "true"}, load_env_file=False),
    )
    assert main._is_exempt("/assets/app.js") is True
    assert main._is_exempt("/") is True
