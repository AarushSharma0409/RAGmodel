// api.ts — all backend calls in one place

const BASE = (import.meta.env.VITE_DOCMIND_API_BASE as string | undefined) ?? "http://127.0.0.1:8000";
const API_KEY = (import.meta.env.VITE_DOCMIND_API_KEY as string | undefined) ?? "";

export interface Citation {
  source_file: string;
  page_number: number;
  locator_type: string;
  excerpt: string;
}

export interface Confidence {
  level: "high" | "medium" | "low";
  reason: string;
}

export interface QueryResponse {
  query: string;
  route: string;
  answer: string;
  citations: Citation[];
  confidence: Confidence;
}

// Upload a document with progress tracking
export async function uploadDocument(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ filename: string; chunks_stored: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      // Accept 200 and 202 (background ingestion)
      if (xhr.status === 200 || xhr.status === 202) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail ?? "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("POST", `${BASE}/documents/upload`);
    // X-API-Key must be set via setRequestHeader for XHR
    // Do NOT set Content-Type — browser sets it automatically with multipart boundary
    xhr.setRequestHeader("X-API-Key", API_KEY);
    xhr.send(form);
  });
}

// List all ingested documents
export async function listDocuments(): Promise<string[]> {
  const r = await fetch(`${BASE}/documents/`, {
    headers: { "X-API-Key": API_KEY },
  });
  if (!r.ok) throw new Error("Failed to fetch documents");
  const data = await r.json();
  return data.documents ?? [];
}

// Send a query
export async function sendQuery(query: string): Promise<QueryResponse> {
  const r = await fetch(`${BASE}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail?.error ?? err.detail ?? "Query failed");
  }
  return r.json();
}