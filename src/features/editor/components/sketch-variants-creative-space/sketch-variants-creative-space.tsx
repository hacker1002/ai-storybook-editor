// sketch-variants-creative-space.tsx — root of the shared sketch entity creative space.
// One component for all 3 kinds (characters/props/stages), parameterized by `kind`.
// Owns 5 local UI states; selection is DERIVED in render (no useEffect+setState — see
// React 19 lint). Excel import is pure (Phase 02) → errors toast & stop; replacing a
// non-empty list goes through a confirm AlertDialog (Validation Q3) before commit.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { Upload } from 'lucide-react';
import { useSketchEntityKeys, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useCurrentBookId } from '@/stores/book-store';
import { useCollabPersistSession } from '@/features/editor/hooks/use-collab-persist-session';
import { useContentSyncSession } from '@/features/editor/hooks/use-content-sync-session';
import { isLockedByOtherNow, type LockTarget } from '@/stores/resource-lock-store';
import { runLockedDelete } from '@/features/editor/utils/structural-lock-delete';
import type { SketchEntityKind } from '@/types/sketch';
import { SketchEntitySidebar } from './sketch-entity-sidebar';
import { SketchEntityContentArea } from './sketch-entity-content-area';
import { EditVariantsModal } from './edit-variants-modal';
import { KIND_CONFIG, KIND_TO_RESOURCE_TYPE } from './sketch-variants-constants';
import {
  parseSketchEntitiesFromFile,
  type ParseSketchEntitiesResult,
} from './import/parse-sketch-entities';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchVariantsCreativeSpace');

/** Surface validation warnings as a single summary toast (avoid spamming N toasts);
 *  full detail goes to the log. */
function reportWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;
  log.warn('import', 'validation warnings', { count: warnings.length, warnings: warnings.slice(0, 10) });
  toast.warning(`Imported with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} — check console.`);
}

interface SketchVariantsCreativeSpaceProps {
  kind: SketchEntityKind;
}

export function SketchVariantsCreativeSpace({ kind }: SketchVariantsCreativeSpaceProps) {
  const cfg = KIND_CONFIG[kind];
  const entityKeys = useSketchEntityKeys(kind);
  const bookId = useCurrentBookId();
  const { setSketchEntities, removeSketchEntity } = useSnapshotActions();

  // Collaborator edit-lock: open the realtime lock channel + route flushes through
  // the gateway (suppress owner-direct autoSave) for as long as this space is mounted.
  useCollabPersistSession(bookId);
  // Collaborator content-sync: refetch + merge peer edits (node / reorder / generate) into
  // the snapshot store so B sees fresh content without a manual refresh (ADR-043 follow-up).
  useContentSyncSession(bookId);

  const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParseSketchEntitiesResult | null>(null);

  // Derive effective selection in render (NOT an effect): user choice if still valid,
  // else first entity. Keeps focus stable across imports/deletes without set-state loops.
  const selectedKey = useMemo(() => {
    if (userSelectedKey && entityKeys.includes(userSelectedKey)) return userSelectedKey;
    return entityKeys[0] ?? null;
  }, [entityKeys, userSelectedKey]);

  const commitImport = useCallback(
    (result: ParseSketchEntitiesResult) => {
      setSketchEntities(kind, result.entities);
      setCheckedKeys([]);
      reportWarnings(result.issues.warnings);
      toast.success(`Imported ${result.entities.length} ${cfg.title.toLowerCase()}`);
    },
    [kind, cfg.title, setSketchEntities],
  );

  const handleImport = useCallback(
    async (file: File) => {
      setIsImporting(true);
      try {
        const result = await parseSketchEntitiesFromFile(file, kind);
        if (result.issues.errors.length > 0) {
          log.warn('handleImport', 'blocking errors', { errors: result.issues.errors });
          toast.error(result.issues.errors[0]);
          return;
        }
        if (entityKeys.length === 0) {
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
    [kind, entityKeys.length, commitImport],
  );

  const confirmImport = useCallback(() => {
    if (pendingImport) commitImport(pendingImport);
    setPendingImport(null);
  }, [pendingImport, commitImport]);

  const handleCheck = useCallback((key: string, next: boolean) => {
    setCheckedKeys((prev) => (next ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));
  }, []);

  const handleCheckAll = useCallback(
    (next: boolean) => {
      setCheckedKeys(next ? [...entityKeys] : []);
    },
    [entityKeys],
  );

  // Delete = destructive structural op (entity type 3/4/5, keyed). The row is already
  // greyed when locked (phase 05); this is the click-time guard (render→click TOCTOU),
  // then acquire → local delete → save(action=4 delete) → release.
  const handleDelete = useCallback(
    async (key: string) => {
      log.info('handleDelete', 'delete entity requested', { kind, key });
      const target: LockTarget = {
        step: 1,
        resource_type: KIND_TO_RESOURCE_TYPE[kind],
        resource_id: key,
        locale: null,
      };
      if (isLockedByOtherNow(target)) {
        log.info('handleDelete', 'blocked — entity locked by other', { kind, key });
        toast.info('Mục này đang được người khác chỉnh sửa — vui lòng thử lại sau.');
        return;
      }
      await runLockedDelete(
        target,
        { action_type: 4, patch: null, target_ref: { kind, entity: key } },
        () => {
          removeSketchEntity(kind, key);
          setCheckedKeys((prev) => prev.filter((k) => k !== key));
          setUserSelectedKey((prev) => (prev === key ? null : prev));
        },
      );
    },
    [kind, removeSketchEntity],
  );

  return (
    <div className="flex h-full" role="main" aria-label={`${cfg.title} creative space`}>
      <SketchEntitySidebar
        kind={kind}
        cfg={cfg}
        entityKeys={entityKeys}
        selectedEntityKey={selectedKey}
        checkedKeys={checkedKeys}
        onSelect={setUserSelectedKey}
        onCheck={handleCheck}
        onCheckAll={handleCheckAll}
        onEdit={setEditingKey}
        onDelete={handleDelete}
        onImport={handleImport}
        isImporting={isImporting}
      />

      <div className="flex-1 overflow-hidden">
        {selectedKey ? (
          <SketchEntityContentArea
            kind={kind}
            cfg={cfg}
            selectedEntityKey={selectedKey}
            checkedKeys={checkedKeys}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Upload className="h-10 w-10 mb-3 opacity-60" aria-hidden="true" />
            <p className="text-sm">No {cfg.title.toLowerCase()} yet</p>
            <p className="text-xs mt-1">Import an Excel file from the sidebar to get started.</p>
          </div>
        )}
      </div>

      {editingKey && (
        <EditVariantsModal kind={kind} entityKey={editingKey} onClose={() => setEditingKey(null)} />
      )}

      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {cfg.title.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces all {entityKeys.length} existing {cfg.title.toLowerCase()} with{' '}
              {pendingImport?.entities.length ?? 0} from the file. Generated sheets on the current
              entities will be lost. This cannot be undone.
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
