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
import { useCurrentBook } from '@/stores/book-store';
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
  const { reorderSketchSpreads, deleteSketchSpread, setSketchSpreads } = useSnapshotActions();

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

  const handleReorder = useCallback(
    (from: number, to: number) => {
      log.info('handleReorder', 'reorder spreads', { from, to });
      reorderSketchSpreads(from, to);
    },
    [reorderSketchSpreads],
  );

  const handleDelete = useCallback(
    (id: string) => {
      log.info('handleDelete', 'delete spread', { id });
      deleteSketchSpread(id);
      setUserSelectedId((prev) => (prev === id ? null : prev));
      setEditingId((prev) => (prev === id ? null : prev));
      setCheckedIds((prev) => prev.filter((x) => x !== id));
    },
    [deleteSketchSpread],
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

  const commitImport = useCallback(
    (result: ParseSketchSpreadsResult) => {
      setSketchSpreads(result.spreads);
      setCheckedIds([]); // stale ids after a full replace
      reportWarnings(result.issues.warnings);
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
          commitImport(result); // nothing to overwrite → commit directly
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
    if (pendingImport) commitImport(pendingImport);
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
