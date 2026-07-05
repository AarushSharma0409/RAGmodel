import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Send,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { uploadDocument, listDocuments, sendQuery } from "./api";
import type { Citation, Confidence, QueryResponse } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Doc {
  id: string;
  name: string;
  progress: number; // 0-100, 100 = done
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: Confidence;
  citations?: Citation[];
  error?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const colors = {
    high: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    low: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors[confidence.level]}`}
      title={confidence.reason}
    >
      <motion.span
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {confidence.level.charAt(0).toUpperCase() + confidence.level.slice(1)} confidence
    </motion.div>
  );
}

function CitationsPanel({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
      >
        <span>{citations.length} source{citations.length > 1 ? "s" : ""}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {citations.map((c, i) => (
                <div key={i} className="rounded-md bg-slate-800/60 p-2.5 text-xs">
                  <div className="flex items-center gap-2 text-violet-400 font-medium mb-1">
                    <FileText size={11} />
                    <span>{c.source_file}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">
                      {c.locator_type === "paragraph_index" ? "¶" : "p."}{c.page_number}
                    </span>
                  </div>
                  {c.excerpt && (
                    <p className="text-slate-400 italic leading-relaxed">"{c.excerpt}"</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [querying, setQuerying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load existing documents on mount
  useEffect(() => {
    listDocuments()
      .then((names) =>
        setDocs(names.map((name) => ({ id: genId(), name, progress: 100 })))
      )
      .catch(() => {});
  }, []);

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const allowed = [".pdf", ".docx", ".txt"];

    for (const file of Array.from(files)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!allowed.includes(ext)) {
        alert(`${file.name} is not supported. Use PDF, DOCX, or TXT.`);
        continue;
      }

      const id = genId();
      setDocs((d) => [...d, { id, name: file.name, progress: 0 }]);

      try {
        await uploadDocument(file, (pct) => {
          setDocs((d) =>
            d.map((doc) => (doc.id === id ? { ...doc, progress: pct } : doc))
          );
        });
        setDocs((d) =>
          d.map((doc) => (doc.id === id ? { ...doc, progress: 100 } : doc))
        );
      } catch (err: any) {
        setDocs((d) => d.filter((doc) => doc.id !== id));
        alert(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
  }, []);

  const handleQuery = async () => {
    const q = input.trim();
    if (!q || querying) return;

    const userMsg: Message = { id: genId(), role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setQuerying(true);

    try {
      const data: QueryResponse = await sendQuery(q);
      const assistantMsg: Message = {
        id: genId(),
        role: "assistant",
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        {
          id: genId(),
          role: "assistant",
          content: err.message ?? "Something went wrong. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-slate-100">
      {/* ── Hero ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden border-b border-slate-800 px-6 py-16 text-center"
      >
        {/* Background orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300">
            <Sparkles size={14} />
            AI-powered document Q&A
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Ask{" "}
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Anything
            </span>
            .{" "}
            <br />
            Cite{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Everything
            </span>
            .
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Upload your documents. Get cited answers powered by AI.
          </p>
        </motion.div>
      </motion.header>

      {/* ── Workspace ── */}
      <main className="flex flex-1 gap-4 p-4 lg:p-6">
        {/* Left — Document panel */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex w-72 shrink-0 flex-col gap-4"
        >
          {/* Upload zone */}
          <div className="rounded-2xl border border-slate-700 bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Documents</h2>

            <input
              ref={inputRef}
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <motion.label
              htmlFor="file-input"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              animate={dragOver ? { scale: 1.02 } : { scale: 1 }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
                dragOver
                  ? "border-violet-400 bg-violet-500/10 shadow-[0_0_40px_rgba(139,92,246,0.3)]"
                  : "border-slate-700 hover:border-violet-500/50 hover:bg-slate-800/50"
              }`}
            >
              <Upload size={24} className="text-violet-400" />
              <p className="text-sm text-slate-300">Drop files or click to upload</p>
              <p className="text-xs text-slate-500">PDF, DOCX, TXT</p>
            </motion.label>
          </div>

          {/* Document list */}
          <div className="flex flex-col gap-2 overflow-y-auto">
            <AnimatePresence>
              {docs.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-xl border border-slate-700 bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText size={14} className="shrink-0 text-violet-400" />
                      <span className="truncate text-sm text-slate-300">{doc.name}</span>
                    </div>
                    {doc.progress === 100 && (
                      <button
                        onClick={() => setDocs((d) => d.filter((x) => x.id !== doc.id))}
                        className="shrink-0 text-slate-600 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {doc.progress < 100 && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${doc.progress}%` }}
                        className="h-full rounded-full bg-violet-500"
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {docs.length === 0 && (
              <p className="text-center text-xs text-slate-600 py-4">
                No documents yet
              </p>
            )}
          </div>
        </motion.aside>

        {/* Right — Chat panel */}
        <motion.section
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex flex-1 flex-col rounded-2xl border border-slate-700 bg-surface overflow-hidden"
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Sparkles size={32} className="mx-auto mb-3 text-violet-500/40" />
                  <p className="text-slate-500 text-sm">Upload a document and ask a question</p>
                </div>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white"
                        : msg.error
                        ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "border border-slate-700 bg-card text-slate-200"
                    }`}
                  >
                    {msg.error && (
                      <div className="flex items-center gap-2 mb-2 text-rose-400">
                        <AlertCircle size={14} />
                        <span className="text-xs font-medium">Error</span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                    {msg.confidence && (
                      <div className="mt-3">
                        <ConfidenceBadge confidence={msg.confidence} />
                        <p className="mt-1.5 text-xs text-slate-500">{msg.confidence.reason}</p>
                      </div>
                    )}

                    {msg.citations && msg.citations.length > 0 && (
                      <CitationsPanel citations={msg.citations} />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {querying && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl border border-slate-700 bg-card px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-violet-400"
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: i * 0.15,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-slate-700 p-4">
            <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-card px-4 py-3 focus-within:border-violet-500/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your documents..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
                style={{ maxHeight: "120px" }}
              />
              <motion.button
                onClick={handleQuery}
                disabled={!input.trim() || querying}
                whileTap={{ scale: 0.92 }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {querying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </motion.button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-600">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </motion.section>
      </main>
    </div>
  );
}