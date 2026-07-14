"""Central backend configuration for DocMind.

This module is the only place that loads backend/.env. Other modules
should import ``settings`` rather than reading environment variables
directly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

SUPPORTED_AUTH_MODES = {"disabled", "api_key"}
DEFAULT_ALLOWED_FILE_TYPES = (".pdf", ".docx", ".txt")


class ConfigError(ValueError):
    """Raised when configuration values are invalid."""


def _get(env: Mapping[str, str], name: str, default: str = "") -> str:
    value = env.get(name, default)
    return value.strip() if isinstance(value, str) else default


def _parse_bool(raw: str, *, name: str) -> bool:
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off", ""}:
        return False
    raise ConfigError(f"{name} must be a boolean value.")


def _parse_int(raw: str, *, name: str, minimum: int | None = None) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer.") from exc
    if minimum is not None and value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}.")
    return value


def _parse_float(raw: str, *, name: str, minimum: float | None = None) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number.") from exc
    if minimum is not None and value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}.")
    return value


def _parse_path(raw: str, *, default: Path, base_dir: Path = BACKEND_DIR) -> Path:
    value = raw.strip()
    path = Path(value) if value else default
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve()


def _parse_csv(raw: str, *, default: tuple[str, ...]) -> tuple[str, ...]:
    if not raw.strip():
        return default
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _parse_file_types(raw: str) -> frozenset[str]:
    values = _parse_csv(raw, default=DEFAULT_ALLOWED_FILE_TYPES)
    normalized = []
    for item in values:
        suffix = item.lower()
        if not suffix.startswith("."):
            suffix = f".{suffix}"
        normalized.append(suffix)
    return frozenset(normalized)


@dataclass(frozen=True)
class Settings:
    app_env: str
    debug: bool
    auth_mode: str
    docmind_api_key: str | None = field(default=None, repr=False)
    chroma_persist_dir: Path = BACKEND_DIR / "chroma_store"
    chroma_collection_name: str = "docmind_chunks"
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_file_types: frozenset[str] = field(default_factory=lambda: frozenset(DEFAULT_ALLOWED_FILE_TYPES))
    cors_origins: tuple[str, ...] = ("*",)
    gemini_api_key: str | None = field(default=None, repr=False)
    google_api_key: str | None = field(default=None, repr=False)
    groq_api_key: str | None = field(default=None, repr=False)
    llm_model_name: str = "gemini-2.5-flash"
    embedding_model_name: str = "all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    retrieval_top_k: int = 5
    full_document_max_chunks: int = 25
    llm_timeout_seconds: float = 30.0
    embedding_timeout_seconds: float = 60.0
    provider_retry_count: int = 0
    hf_space: bool = False
    hf_static_dir: Path = Path("/home/appuser/backend/static")

    @property
    def has_docmind_api_key(self) -> bool:
        return bool(self.docmind_api_key)

    @property
    def has_llm_api_key(self) -> bool:
        return bool(self.gemini_api_key or self.google_api_key or self.groq_api_key)

    def __repr__(self) -> str:
        return (
            "Settings("
            f"app_env={self.app_env!r}, "
            f"debug={self.debug!r}, "
            f"auth_mode={self.auth_mode!r}, "
            f"has_docmind_api_key={self.has_docmind_api_key!r}, "
            f"chroma_persist_dir={str(self.chroma_persist_dir)!r}, "
            f"chroma_collection_name={self.chroma_collection_name!r}, "
            f"cors_origins={self.cors_origins!r}, "
            f"has_llm_api_key={self.has_llm_api_key!r}, "
            f"llm_model_name={self.llm_model_name!r}, "
            f"embedding_model_name={self.embedding_model_name!r}, "
            f"hf_space={self.hf_space!r}"
            ")"
        )


def build_settings(
    environ: Mapping[str, str] | None = None,
    *,
    load_env_file: bool = False,
    dotenv_path: Path = ENV_PATH,
) -> Settings:
    if load_env_file:
        load_dotenv(dotenv_path=dotenv_path)

    env = os.environ if environ is None else environ
    app_env = _get(env, "APP_ENV", "local").lower()
    auth_mode = _get(env, "AUTH_MODE", "api_key").lower()
    if auth_mode not in SUPPORTED_AUTH_MODES:
        raise ConfigError(f"AUTH_MODE must be one of: {', '.join(sorted(SUPPORTED_AUTH_MODES))}.")

    max_upload_bytes = _parse_int(
        _get(env, "MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)),
        name="MAX_UPLOAD_BYTES",
        minimum=1,
    )
    retrieval_top_k = _parse_int(_get(env, "RETRIEVAL_TOP_K", "5"), name="RETRIEVAL_TOP_K", minimum=1)
    full_document_max_chunks = _parse_int(
        _get(env, "FULL_DOCUMENT_MAX_CHUNKS", "25"),
        name="FULL_DOCUMENT_MAX_CHUNKS",
        minimum=1,
    )
    llm_timeout_seconds = _parse_float(
        _get(env, "LLM_TIMEOUT_SECONDS", "30"),
        name="LLM_TIMEOUT_SECONDS",
        minimum=0.001,
    )
    embedding_timeout_seconds = _parse_float(
        _get(env, "EMBEDDING_TIMEOUT_SECONDS", "60"),
        name="EMBEDDING_TIMEOUT_SECONDS",
        minimum=0.001,
    )
    provider_retry_count = _parse_int(
        _get(env, "PROVIDER_RETRY_COUNT", "0"),
        name="PROVIDER_RETRY_COUNT",
        minimum=0,
    )

    docmind_api_key = _get(env, "DOCMIND_API_KEY") or None
    if app_env == "production" and auth_mode == "api_key" and not docmind_api_key:
        raise ConfigError("DOCMIND_API_KEY is required when APP_ENV=production and AUTH_MODE=api_key.")

    return Settings(
        app_env=app_env,
        debug=_parse_bool(_get(env, "DEBUG", "false"), name="DEBUG"),
        auth_mode=auth_mode,
        docmind_api_key=docmind_api_key,
        chroma_persist_dir=_parse_path(
            _get(env, "CHROMA_PERSIST_DIR"),
            default=BACKEND_DIR / "chroma_store",
        ),
        chroma_collection_name=_get(env, "CHROMA_COLLECTION_NAME", "docmind_chunks"),
        upload_dir=_parse_path(_get(env, "UPLOAD_DIR"), default=BACKEND_DIR / "data" / "uploads"),
        max_upload_bytes=max_upload_bytes,
        allowed_file_types=_parse_file_types(_get(env, "ALLOWED_FILE_TYPES")),
        cors_origins=_parse_csv(_get(env, "CORS_ORIGINS"), default=("*",)),
        gemini_api_key=_get(env, "GEMINI_API_KEY") or None,
        google_api_key=_get(env, "GOOGLE_API_KEY") or None,
        groq_api_key=_get(env, "GROQ_API_KEY") or None,
        llm_model_name=_get(env, "LLM_MODEL_NAME", "gemini-2.5-flash"),
        embedding_model_name=_get(env, "EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2"),
        embedding_dimension=_parse_int(_get(env, "EMBEDDING_DIMENSION", "384"), name="EMBEDDING_DIMENSION", minimum=1),
        retrieval_top_k=retrieval_top_k,
        full_document_max_chunks=full_document_max_chunks,
        llm_timeout_seconds=llm_timeout_seconds,
        embedding_timeout_seconds=embedding_timeout_seconds,
        provider_retry_count=provider_retry_count,
        hf_space=_parse_bool(_get(env, "HF_SPACE", "false"), name="HF_SPACE"),
        hf_static_dir=_parse_path(
            _get(env, "HF_STATIC_DIR"),
            default=Path("/home/appuser/backend/static"),
            base_dir=Path("/"),
        ),
    )


settings = build_settings(load_env_file=True)
