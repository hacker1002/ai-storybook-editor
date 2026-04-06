// history-types.ts - Types and utilities for HistoryCreativeSpace feature
// Colocated here because history data is read-only and not shared outside this feature.
import type { ManuscriptDoc } from "@/types/editor";
import type { ManuscriptDummy } from "@/types/dummy";
import type { IllustrationData } from "@/types/illustration-types";
import type { Prop } from "@/types/prop-types";
import type { Character } from "@/types/character-types";
import type { Stage } from "@/types/stage-types";

// Lightweight version summary — used for sidebar list (metadata only)
export interface SnapshotVersion {
  id: string;
  version: string; // "YYYYMMDDHHmm" format
  save_type: 1 | 2; // 1=manual, 2=auto
  created_at: string;
  updated_at: string;
}

// Snapshot with illustration only — used for main view preview
export interface HistorySnapshotData {
  id: string;
  version: string;
  save_type: 1 | 2;
  updated_at: string;
  illustration: IllustrationData | null;
}

// Full snapshot row — all columns, used for revert initSnapshot call
export interface FullSnapshotRow {
  id: string;
  book_id: string;
  version: string;
  save_type: 1 | 2;
  tag: string | null;
  updated_at: string;
  created_at: string;
  docs: ManuscriptDoc[] | null;
  dummies: ManuscriptDummy[] | null;
  illustration: IllustrationData | null;
  props: Prop[] | null;
  characters: Character[] | null;
  stages: Stage[] | null;
}

/**
 * Format an ISO timestamp for display in the history sidebar.
 * Same year → "Apr 6, 10:43 AM"
 * Different year → "Apr 6, 2025 10:43 AM"
 */
export function formatHistoryTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();

  const timePart = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (sameYear) {
    const datePart = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${datePart}, ${timePart}`;
  }

  const datePart = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${datePart}, ${timePart}`;
}
