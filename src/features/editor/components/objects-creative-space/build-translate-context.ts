import type { Book } from "@/types/editor";
import type { BaseSpread } from "@/types/spread-types";
import { TARGET_AUDIENCE_LABELS } from "@/constants/config-constants";

const MAX_CONTEXT_LEN = 8000;

export function buildTranslateContext(
  book: Book | null | undefined,
  spread: BaseSpread | undefined
): string | undefined {
  if (!book || !spread) return undefined;

  const parts: string[] = [];
  if (book.title) parts.push(`Book title: ${book.title}`);
  if (book.description) parts.push(`Description: ${book.description}`);

  const audience =
    book.target_audience != null ? TARGET_AUDIENCE_LABELS[book.target_audience] : undefined;
  if (audience) parts.push(`Target audience: ${audience}`);

  if (spread.manuscript) parts.push(`Current spread story:\n${spread.manuscript}`);

  if (parts.length === 0) return undefined;

  const result = parts.join("\n\n");
  if (result.length > MAX_CONTEXT_LEN) {
    return result.slice(0, MAX_CONTEXT_LEN - 10) + "\n...[truncated]";
  }
  return result;
}
