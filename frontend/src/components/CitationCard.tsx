import { FileText } from "lucide-react";
import type { Citation } from "../types";

interface CitationCardProps {
  citation: Citation;
}

export function CitationCard({ citation }: CitationCardProps) {
  // locator_type distinguishes a real PDF page from a DOCX paragraph
  // proxy (see loaders.py) - the label must be honest about which one
  // this is, not just always say "Page N".
  const locationLabel =
    citation.locator_type === "paragraph_index"
      ? `¶${citation.page_number ?? "?"}`
      : `Page ${citation.page_number ?? "?"}`;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/50">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
      <div className="min-w-0">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {citation.source_file}{" "}
          <span className="font-normal text-gray-500 dark:text-gray-400">
            · {locationLabel}
          </span>
        </div>
        {citation.excerpt && (
          <p className="mt-1 truncate text-gray-600 dark:text-gray-300">
            "{citation.excerpt}"
          </p>
        )}
      </div>
    </div>
  );
}
