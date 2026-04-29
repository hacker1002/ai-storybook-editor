import type { Book } from "@/types/editor";
import type { BaseSpread, SpreadTextboxContent } from "@/types/spread-types";
import { TARGET_AUDIENCE_LABELS } from "@/constants/config-constants";

const MAX_CONTEXT_LEN = 8000;

export function buildBookContext(
  book: Book | null | undefined,
  spreads: BaseSpread[] | null | undefined,
  selectedSpread: BaseSpread | undefined
): string | undefined {
  if (!book) return undefined;

  const parts: string[] = [];
  if (book.title) parts.push(`Book title: ${book.title}`);
  if (book.description) parts.push(`Description: ${book.description}`);

  const audience =
    book.target_audience != null ? TARGET_AUDIENCE_LABELS[book.target_audience] : undefined;
  if (audience) parts.push(`Target audience: ${audience}`);

  const rawScripts = collectRawScripts(spreads, book.original_language);
  if (rawScripts) parts.push(`Raw scripts:\n${rawScripts}`);

  if (selectedSpread?.manuscript) {
    parts.push(`Current spread story:\n${selectedSpread.manuscript}`);
  }

  if (parts.length === 0) return undefined;

  const result = parts.join("\n\n");
  if (result.length > MAX_CONTEXT_LEN) {
    return result.slice(0, MAX_CONTEXT_LEN - 10) + "\n...[truncated]";
  }
  return result;
}

function collectRawScripts(
  spreads: BaseSpread[] | null | undefined,
  originalLanguage: string
): string {
  if (!spreads?.length) return "";
  const lines: string[] = [];
  for (const spread of spreads) {
    const textboxes = spread.raw_textboxes;
    if (!textboxes?.length) continue;
    for (const tb of textboxes) {
      const content = tb[originalLanguage] as SpreadTextboxContent | undefined;
      const text = content?.text?.trim();
      if (text) lines.push(`  ${text}`);
    }
  }
  return lines.join("\n");
}
