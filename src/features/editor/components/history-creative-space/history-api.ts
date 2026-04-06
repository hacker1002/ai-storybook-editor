// history-api.ts - Supabase queries for HistoryCreativeSpace
// Feature-local file: read-only queries, no state sharing → acceptable deviation from src/apis/ convention.
import { supabase } from "@/apis/supabase";
import { createLogger } from "@/utils/logger";
import type {
  SnapshotVersion,
  HistorySnapshotData,
  FullSnapshotRow,
} from "./history-types";

const log = createLogger("Editor", "HistoryAPI");

/**
 * Fetch lightweight version list for sidebar.
 * Returns metadata only (no illustration data).
 */
export async function fetchVersionList(bookId: string): Promise<SnapshotVersion[]> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("id, version, save_type, created_at, updated_at")
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });

  if (error) {
    log.error("fetchVersionList", "failed", { bookId, error: error.message });
    return [];
  }

  return (data ?? []) as SnapshotVersion[];
}

/**
 * Fetch illustration-only snapshot data for main view preview.
 * Only selects columns needed to render the canvas.
 */
export async function fetchSnapshotForPreview(
  versionId: string
): Promise<HistorySnapshotData | null> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("id, version, save_type, updated_at, illustration")
    .eq("id", versionId)
    .single();

  if (error) {
    log.error("fetchSnapshotForPreview", "failed", { versionId, error: error.message });
    return null;
  }

  return data as HistorySnapshotData;
}

/**
 * Fetch all snapshot columns for revert operation.
 * Used to populate initSnapshot() with full data.
 */
export async function fetchFullSnapshot(
  versionId: string
): Promise<FullSnapshotRow | null> {
  const { data, error } = await supabase
    .from("snapshots")
    .select("*")
    .eq("id", versionId)
    .single();

  if (error) {
    log.error("fetchFullSnapshot", "failed", { versionId, error: error.message });
    return null;
  }

  return data as FullSnapshotRow;
}

/**
 * Update books.current_version to point to the selected snapshot.
 * DB is source of truth — if store init later fails, page refresh restores correct version.
 */
export async function revertToVersion(
  bookId: string,
  versionId: string
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from("books")
    .update({ current_version: versionId })
    .eq("id", bookId);

  if (error) {
    log.error("revertToVersion", "failed", { bookId, versionId, error: error.message });
    return { success: false };
  }

  log.info("revertToVersion", "done", { bookId, versionId });
  return { success: true };
}
