import { useEffect, useState, useCallback } from "react";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { DocumentUpload } from "./components/DocumentUpload";
import { DocumentList } from "./components/DocumentList";
import { useChat } from "./hooks/useChat";
import { listDocuments } from "./lib/api";

// Deliberately NOT using a router or multiple pages here - Phase 4's scope,
// as scoped down from the larger SaaS spec, is exactly three things:
// upload, chat, and visible citations. Adding routed pages (landing, auth,
// settings) would be scope creep beyond what was agreed.
function App() {
  const { messages, isLoading, sendMessage } = useChat();
  const [documents, setDocuments] = useState<string[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await listDocuments();
      setDocuments(res.documents);
      setDocsError(null);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to load documents.");
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  return (
    <div className="flex h-screen bg-white text-gray-900 dark:bg-[#0D1117] dark:text-gray-100">
      {/* Sidebar - documents */}
      <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-gray-200 p-4 dark:border-gray-800">
        <h1 className="text-lg font-semibold">DocMind</h1>
        <DocumentUpload onUploaded={refreshDocuments} />
        {docsError && <p className="text-xs text-red-500">{docsError}</p>}
        <div className="flex-1 overflow-y-auto">
          <DocumentList documents={documents} />
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Upload a document, then ask a question about it.
            </p>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isLoading && (
            <p className="text-sm text-gray-400 dark:text-gray-500">Thinking...</p>
          )}
        </div>
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </main>
    </div>
  );
}

export default App;
