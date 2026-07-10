// sketch-spreads-creative-space.tsx — root of the sketch-spread (storyboard) creative space.
// The 4th sketch step space, STANDALONE (not a `kind` of SketchVariantsCreativeSpace).
// Owns UI state: selected / editing / importing (+ pending confirm-replace). Selection is
// DERIVED in render (no useEffect+setState — React 19 lint), mirroring the entity sibling.
// Import = Storyboard (.xlsx) → SketchSpread[] (pure parse), bulk-replace after a confirm.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGrid } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSketchSpreadIds, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useCurrentBook, useCurrentBookId } from '@/stores/book-store';
import { useCollabPersistSession } from '@/features/editor/hooks/use-collab-persist-session';
import { useContentSyncSession } from '@/features/editor/hooks/use-content-sync-session';
import {
  useResourceLockStore,
  FALLBACK_HOLDER_NAME,
  isSpreadStructurallyLockedByOther,
  type LockTarget,
} from '@/stores/resource-lock-store';
import { reorderResource } from '@/apis/resource-lock-api';
import { runLockedDelete } from '@/features/editor/utils/structural-lock-delete';
import { runLockedCollectionSave } from '@/features/editor/utils/structural-lock-collection-save';
import { createLogger } from '@/utils/logger';
import { SketchSpreadSidebar } from './sketch-spread-sidebar';
import { SketchSpreadContentArea } from './sketch-spread-content-area';
import { EditSpreadModal } from './edit-spread-modal';
import {
  parseSketchSpreadsFromFile,
  type ParseSketchSpreadsResult,
} from './import/parse-sketch-spreads';

const log = createLogger('Editor', 'SketchSpreadsCreativeSpace');

/** Surface validation warnings as a single summary toast (avoid spamming N toasts). */
function reportWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  log.warn('import', 'validation warnings', { count: warnings.length, warnings: warnings.slice(0, 10) });
  toast.warning(`Imported with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} — check console.`);
}

export function SketchSpreadsCreativeSpace() {
  const spreadIds = useSketchSpreadIds();
  const book = useCurrentBook();
  const bookId = useCurrentBookId();
  const { reorderSketchSpreads, deleteSketchSpread, setSketchSpreads } = useSnapshotActions();

  // Collaborator edit-lock: open the realtime lock channel + route flushes through
  // the gateway (suppress owner-direct autoSave) for as long as this space is mounted.
  useCollabPersistSession(bookId);
  // Collaborator content-sync: refetch + merge peer edits (node / reorder / generate) into
  // the snapshot store so B sees fresh content without a manual refresh (ADR-043 follow-up).
  useContentSyncSession(bookId);

  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]); // bulk-select (checkbox) — distinct from row focus
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParseSketchSpreadsResult | null>(null);

  // Derive effective selection in render (NOT an effect): user choice if still valid,
  // else first spread. Keeps focus stable across imports/deletes without set-state loops.
  const selectedId = useMemo(() => {
    if (userSelectedId && spreadIds.includes(userSelectedId)) return userSelectedId;
    return spreadIds[0] ?? null;
  }, [spreadIds, userSelectedId]);

  // Reorder = structural op (type-6 lock, phase 08 order-write endpoint). Optimistic
  // local reorder → acquire the DRAGGED spread's lock → permute server-side (client
  // sends ONLY ordered_ids, never node bodies → no stale-array clobber) → release.
  // NO child-lock guard: reorder does not touch content (SRS §4.5). Revert to the
  // pre-reorder snapshot on acquire-block / endpoint failure.
  const handleReorder = useCallback(
    async (from: number, to: number) => {
      log.info('handleReorder', 'reorder spreads requested', { from, to });
      const oldSpreads = useSnapshotStore.getState().sketch.spreads; // pre-reorder snapshot (exact revert)
      const currentIds = oldSpreads.map((s) => s.id);
      const len = currentIds.length;
      // Mirror `reorderSketchSpreads` clamp/no-op semantics so the optimistic UI and
      // the `ordered_ids` we send stay identical.
      const f = Math.max(0, Math.min(from, len - 1));
      const t = Math.max(0, Math.min(to, len - 1));
      if (len === 0 || f === t) {
        log.debug('handleReorder', 'no-op reorder', { from, to, len });
        return;
      }
      const draggedId = currentIds[f];
      // Guard BEFORE the optimistic mutation so a null book never flashes an
      // apply-then-revert (nothing has moved yet to revert).
      if (!bookId) {
        log.warn('handleReorder', 'no book connected — skip reorder', { draggedId });
        toast.error('Không xác định được sách — vui lòng tải lại trang.');
        return;
      }
      const newIds = [...currentIds];
      const [moved] = newIds.splice(f, 1);
      newIds.splice(t, 0, moved);

      const target: LockTarget = { step: 1, resource_type: 6, resource_id: draggedId, locale: null };
      reorderSketchSpreads(from, to); // optimistic UI

      const store = useResourceLockStore.getState();
      const acq = await store.acquire(target);
      if (!acq.ok) {
        setSketchSpreads(oldSpreads);
        const name = acq.holder
          ? store.holderNames.get(acq.holder) ?? FALLBACK_HOLDER_NAME
          : FALLBACK_HOLDER_NAME;
        log.info('handleReorder', 'acquire blocked — revert', { draggedId, hasHolder: !!acq.holder });
        toast.info(`${name} đang chỉnh sửa — vui lòng thử lại sau.`);
        return;
      }
      try {
        const res = await reorderResource({
          bookId,
          step: 1,
          resourceType: 6,
          resourceId: draggedId,
          orderedIds: newIds,
          // 1-based to match the `spread_number` ordinal used by edit/delete/generate
          // audits in the same target_type=1 activity feed (f/t are 0-based indices).
          targetRef: { from: f + 1, to: t + 1 },
        });
        if (!res.ok) {
          setSketchSpreads(oldSpreads); // revert exact pre-reorder order
          log.warn('handleReorder', 'reorder endpoint failed — reverted', { draggedId, code: res.code });
          if (res.code === 'SET_MISMATCH') {
            toast.error('Danh sách spread đã thay đổi — tải lại trang rồi thử lại.');
          } else {
            toast.error('Không sắp xếp lại được — vui lòng thử lại.');
          }
        }
      } finally {
        await store.release(target);
      }
    },
    [bookId, reorderSketchSpreads, setSketchSpreads],
  );

  // Delete = destructive structural op (type-6 lock). Guard child-lock FIRST (type-6
  // key differs from content keys 1/2, so scan children explicitly — SRS §4.5), then
  // acquire → local delete → save(action=4 delete) → release.
  const handleDelete = useCallback(
    async (id: string) => {
      log.info('handleDelete', 'delete spread requested', { id });
      const spread = useSnapshotStore.getState().sketch.spreads.find((s) => s.id === id);
      const childImageIds = spread?.images.map((im) => im.id) ?? [];
      const childTextboxIds = spread?.textboxes.map((tb) => tb.id) ?? [];
      if (isSpreadStructurallyLockedByOther(id, childImageIds, childTextboxIds)) {
        log.info('handleDelete', 'blocked — spread or a child node is locked by other', { id });
        toast.info('Spread này đang được người khác chỉnh sửa — vui lòng thử lại sau.');
        return;
      }
      const idx = spreadIds.indexOf(id);
      const spread_number = idx >= 0 ? idx + 1 : 1; // 1-based doc-order position (audit)
      const target: LockTarget = { step: 1, resource_type: 6, resource_id: id, locale: null };
      await runLockedDelete(
        target,
        { action_type: 4, patch: null, target_ref: { spread_number } },
        () => {
          deleteSketchSpread(id);
          setUserSelectedId((prev) => (prev === id ? null : prev));
          setEditingId((prev) => (prev === id ? null : prev));
          setCheckedIds((prev) => prev.filter((x) => x !== id));
        },
      );
    },
    [spreadIds, deleteSketchSpread],
  );

  const handleCheck = useCallback((id: string, next: boolean) => {
    setCheckedIds((prev) => (next ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }, []);

  const handleCheckAll = useCallback(
    (next: boolean) => {
      setCheckedIds(next ? [...spreadIds] : []);
    },
    [spreadIds],
  );

  // Commit = optimistic local whole-array replace + gateway collection-scope save (the ONLY
  // persistence path — `useCollabPersistSession` suppresses owner-direct autosave). rtype 6
  // (spread); sentinel resource_id + collection = 'spreads' → writes `sketch.spreads` whole.
  // `result.spreads` IS the exact `sketch.spreads` node shape. Coarse lock (accepted race).
  const commitImport = useCallback(
    async (result: ParseSketchSpreadsResult) => {
      const target: LockTarget = { step: 1, resource_type: 6, resource_id: 'spreads', locale: null };
      const outcome = await runLockedCollectionSave(
        target,
        {
          action_type: 3, // edit (replace-all)
          patch: result.spreads,
          collection: 'spreads',
          target_ref: { count: result.spreads.length },
        },
        () => {
          setSketchSpreads(result.spreads);
          setCheckedIds([]); // stale ids after a full replace
        },
      );
      if (outcome === 'blocked') return; // nothing applied; holder toast already shown
      reportWarnings(result.issues.warnings);
      if (outcome === 'failed') {
        toast.error('Import chưa lưu được — vui lòng tải lại trang.');
        return;
      }
      toast.success(`Imported ${result.spreads.length} spread${result.spreads.length === 1 ? '' : 's'}`);
    },
    [setSketchSpreads],
  );

  const handleImport = useCallback(
    async (file: File) => {
      if (!book) {
        toast.error('No book is open.');
        return;
      }
      setIsImporting(true);
      try {
        const result = await parseSketchSpreadsFromFile(file, {
          original_language: book.original_language,
          typography: book.typography ?? null,
        });
        if (result.issues.errors.length > 0) {
          log.warn('handleImport', 'blocking errors', { errors: result.issues.errors });
          toast.error(result.issues.errors[0]);
          return;
        }
        if (spreadIds.length === 0) {
          await commitImport(result); // nothing to overwrite → commit directly (keep spinner through save)
        } else {
          setPendingImport(result); // confirm replace via AlertDialog
        }
      } catch (err) {
        log.error('handleImport', 'parse failed', { error: String(err) });
        toast.error('Could not read the Excel file');
      } finally {
        setIsImporting(false);
      }
    },
    [book, spreadIds.length, commitImport],
  );

  const confirmImport = useCallback(() => {
    if (pendingImport) void commitImport(pendingImport);
    setPendingImport(null);
  }, [pendingImport, commitImport]);

  return (
    <div className="flex h-full" role="main" aria-label="Spreads creative space">
      <SketchSpreadSidebar
        spreadIds={spreadIds}
        selectedSpreadId={selectedId}
        checkedIds={checkedIds}
        onSelect={setUserSelectedId}
        onCheck={handleCheck}
        onCheckAll={handleCheckAll}
        onReorder={handleReorder}
        onEdit={setEditingId}
        onDelete={handleDelete}
        onImport={handleImport}
        isImporting={isImporting}
      />

      {selectedId ? (
        <SketchSpreadContentArea spreadId={selectedId} checkedSpreadIds={checkedIds} />
      ) : (
        <section
          className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground"
          role="region"
          aria-label="No spreads"
        >
          <LayoutGrid className="mb-3 h-10 w-10 opacity-60" aria-hidden="true" />
          <p className="text-sm">No spreads yet</p>
          <p className="mt-1 text-xs">Import a storyboard from the sidebar to get started.</p>
        </section>
      )}

      {/* key={editingId} forces a remount on A→B switch so the draft never leaks across spreads. */}
      {editingId && (
        <EditSpreadModal key={editingId} spreadId={editingId} onClose={() => setEditingId(null)} />
      )}

      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all spreads?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces all {spreadIds.length} existing spread{spreadIds.length === 1 ? '' : 's'} with{' '}
              {pendingImport?.spreads.length ?? 0} from the file. Generated images on the current
              spreads will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
