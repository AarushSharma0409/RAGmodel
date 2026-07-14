// Mirrors generator.py's citation shape exactly - source_file, page_number,
// locator_type, excerpt. locator_type matters because DOCX chunks report
// "paragraph_index" instead of "page" (see loaders.py) - the UI needs to
// know which label to render ("Page 4" vs "¶12").
export interface Citation {
  source_file: string;
  page_number: number | null;
  locator_type: string;
  excerpt: string;
}

// Mirrors confidence.py's assess_confidence() output. Kept as a named
// three-level enum (not a raw float) because that's the whole design
// decision documented in ARCHITECTURE.md - the judgment is made once,
// server-side, not re-interpreted ad hoc in the UI.
export interface Confidence {
  level: "high" | "medium" | "low";
  reason: string;
}

// Mirrors query.py's /query/ endpoint success response shape exactly.
export interface QueryResponse {
  query: string;
  route: "retrieve" | "full_document" | "no_retrieval";
  answer: string;
  citations: Citation[];
  confidence: Confidence;
}

// A single message in the chat UI. Distinct from QueryResponse because a
// "message" needs to represent BOTH user turns (no citations/confidence)
// and assistant turns (which have them) in one list the UI can render.
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  confidence?: Confidence;
  isError?: boolean;
}

// Mirrors documents.py's GET /documents/ response shape.
export interface DocumentListResponse {
  documents: string[];
  count: number;
}

// Mirrors documents.py's POST /documents/upload success response shape.
export interface UploadResponse {
  message: string;
  filename: string;
  chunks_stored: number;
}
