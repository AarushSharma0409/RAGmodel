"""
main.py — FastAPI entry point

Wires the app together: auth middleware, rate limiting, CORS, routers,
lifespan model warm, and optional static file serving on HF Spaces.

CIRCULAR IMPORT NOTE:
The rate limiter is defined in limiter.py, not here. This is deliberate —
routers need to import the limiter, and if it were defined in main.py,
importing it from routers would create a circular dependency
(main → routers → main). limiter.py has no such dependencies.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.limiter import limiter
from app.api.routers import documents, query
from app.core.config import settings
from app.ingestion.embedder import get_model

# ── API key auth ──────────────────────────────────────────────────────────────
DOCMIND_API_KEY = settings.docmind_api_key or ""
# Static frontend routes and API docs are exempt from auth.
# All /api/ routes still require X-API-Key.
_AUTH_EXEMPT = {"/health", "/docs", "/openapi.json", "/redoc"}

def _is_exempt(path: str) -> bool:
    """Exempt static frontend assets and known open API paths."""
    if path in _AUTH_EXEMPT:
        return True
    # Allow all static asset requests (JS, CSS, images, fonts)
    static_exts = (".js", ".css", ".png", ".ico", ".svg", ".woff", ".woff2", ".html", ".json")
    if any(path.endswith(ext) for ext in static_exts):
        return True
    # Allow root — serves index.html
    if path == "/" or path == "":
        return True
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(
        "Config loaded: "
        f"env={settings.app_env}, auth_mode={settings.auth_mode}, "
        f"chroma_dir={settings.chroma_persist_dir}, "
        f"collection={settings.chroma_collection_name}, "
        f"llm_key_configured={settings.has_llm_api_key}"
    )
    if settings.auth_mode == "disabled" or not DOCMIND_API_KEY:
        print("WARNING: DOCMIND_API_KEY is not set — endpoints are unprotected")
    else:
        print(f"API key auth enabled (key length: {len(DOCMIND_API_KEY)} chars)")

    print("Loading embedding model...")
    get_model()
    print("Model ready — accepting requests")
    yield


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="DocMind API",
    description="Multi-document RAG system with citations and confidence signaling.",
    version="0.1.0",
    lifespan=lifespan,
    debug=settings.debug,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    # Always allow CORS preflight requests through — the browser sends
    # OPTIONS before every cross-origin request. If we reject OPTIONS with
    # 401, the CORS middleware never gets to add the Allow-Origin header,
    # and the real request fails with a CORS error instead of a 401.
    if request.method == "OPTIONS":
        return await call_next(request)

    if _is_exempt(request.url.path):
        return await call_next(request)
    if settings.auth_mode == "disabled" or not DOCMIND_API_KEY:
        return await call_next(request)
    provided_key = request.headers.get("X-API-Key", "").strip()
    if provided_key != DOCMIND_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or missing API key. Set X-API-Key header."},
        )
    return await call_next(request)


# Routers
app.include_router(documents.router)
app.include_router(query.router)

# On HF Spaces, serve the built React frontend as static files.
# The Dockerfile copies frontend/dist into backend/static, so the
# static folder sits alongside the app/ package inside /home/appuser/backend.
if settings.hf_space:
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    _static = settings.hf_static_dir
    print(f"Serving frontend from {_static} (exists={_static.exists()})")
    # Debug: list contents so we can see what's actually there
    try:
        files = list(_static.iterdir()) if _static.exists() else []
        print(f"static/ contents: {[f.name for f in files]}")
        assets = _static / "assets"
        if assets.exists():
            print(f"assets/ contents: {[f.name for f in list(assets.iterdir())[:5]]}")
    except Exception as e:
        print(f"listing error: {e}")

    if _static.exists():
        # Vite SSR builds output to client/ and server/ subdirectories.
        # Standard builds output index.html directly. Handle both.
        _client = _static / "client"
        _serve_dir = _client if _client.exists() else _static
        print(f"Serving SPA from {_serve_dir}")

        # Mount static assets
        _assets = _serve_dir / "assets"
        if _assets.exists():
            app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

        # Catch-all: always serve index.html for client-side routing
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            index = _serve_dir / "index.html"
            if index.exists():
                return FileResponse(str(index))
            return JSONResponse(status_code=404, content={"detail": f"Frontend not found at {index}"})
    else:
        print("WARNING: static folder not found — frontend will not be served")


@app.get("/health")
def health_check():
    """Liveness check — no auth required."""
    return {"status": "ok"}
