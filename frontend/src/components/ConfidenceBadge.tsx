import type { Confidence } from "../types";

// Color-coding by level, not by raw score - deliberately mirrors the
// backend's decision (confidence.py) to expose three named levels instead
// of a float. The UI shouldn't re-derive its own thresholds from a number;
// it just renders the judgment the server already made.
const LEVEL_STYLES: Record<Confidence["level"], string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  low: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

interface ConfidenceBadgeProps {
  confidence: Confidence;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  return (
    <div className="inline-flex flex-col gap-1">
      <span
        className={`inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLES[confidence.level]}`}
      >
        {confidence.level.toUpperCase()} CONFIDENCE
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {confidence.reason}
      </span>
    </div>
  );
}
