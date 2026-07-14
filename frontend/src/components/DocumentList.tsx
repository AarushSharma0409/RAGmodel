import { FileText } from "lucide-react";

interface DocumentListProps {
  documents: string[];
}

export function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {documents.map((name) => (
        <li
          key={name}
          className="flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200"
        >
          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate">{name}</span>
        </li>
      ))}
    </ul>
  );
}
