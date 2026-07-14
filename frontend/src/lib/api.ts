import type {
  QueryResponse,
  Confidence,
  DocumentListResponse,
  UploadResponse,
} from "../types";

// Read from .env rather than hardcoding, so switching environments (local
// dev vs. a deployed backend in Phase 5) doesn't require touching source.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const API_KEY = import.meta.env.VITE_DOCMIND_API_KEY?.trim();

function buildHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...(extra ?? {}),
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
  };
}

// A dedicated error class, not a plain thrown string. query.py's design
// deliberately preserves confidence through a generation failure (assess
// confidence BEFORE generation, so the signal survives even if generation
// raises) - if this error type didn't carry `confidence`, that signal would
// have nowhere to go and the UI couldn't show "retrieval was weak" on the
// one path where that information matters most.
export class QueryError extends Error {
  confidence?: Confidence;
  constructor(message: string, confidence?: Confidence) {
    super(message);
    this.name = "QueryError";
    this.confidence = confidence;
  }
}

export async function queryDocuments(query: string): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE_URL}/query/`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);

    // GenerationError case (query.py raises 500 with detail = {error, confidence})
    if (body?.detail && typeof body.detail === "object") {
      throw new QueryError(
        body.detail.error ?? "Query failed",
        body.detail.confidence
      );
    }

    // Validation error case (422: empty query) - detail is a plain string
    throw new QueryError(body?.detail ?? `Request failed with status ${res.status}`);
  }

  return res.json();
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Upload failed with status ${res.status}`);
  }

  return res.json();
}

export async function listDocuments(): Promise<DocumentListResponse> {
  const res = await fetch(`${API_BASE_URL}/documents/`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Failed to list documents (status ${res.status})`);
  }

  return res.json();
}
