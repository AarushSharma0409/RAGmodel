import type { ChatMessage as ChatMessageType } from "../types";
import { CitationCard } from "./CitationCard";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-indigo-600 text-white"
            : message.isError
            ? "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200"
            : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{message.text}</p>

        {/* Confidence renders for assistant turns regardless of success/failure -
            this is the direct UI expression of query.py's "assess confidence
            before generation" design: the signal must survive a generation error. */}
        {!isUser && message.confidence && (
          <div className="mt-3">
            <ConfidenceBadge confidence={message.confidence} />
          </div>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.citations.map((citation, idx) => (
              <CitationCard key={idx} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
