import { useState, useCallback } from "react";
import { queryDocuments, QueryError } from "../lib/api";
import type { ChatMessage } from "../types";

// State lives in a hook, not inside a component, for a reason specific to
// this backend's contract: a failed query (GenerationError) still carries
// a confidence assessment (see api.ts's QueryError). That means "confidence"
// isn't just a property of the last successful answer - it can exist
// independently of success/failure. Keeping that logic in a component would
// tangle it with JSX; a hook keeps the state transitions explicit and testable
// on their own.
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await queryDocuments(trimmed);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: response.answer,
        citations: response.citations,
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // Even on failure, surface confidence if the backend provided it -
      // this is the entire reason QueryError carries a confidence field.
      const isQueryError = err instanceof QueryError;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: isQueryError ? err.message : "Something went wrong. Please try again.",
        confidence: isQueryError ? err.confidence : undefined,
        isError: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, isLoading, sendMessage };
}
