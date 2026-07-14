// sketch-base-creative-space.tsx — root of the Base creative space (design README §2). ONE
// space for BOTH kinds (character + prop) — no `kind` prop. Owns the local UI state (selected
// style, active tab, zoom, expanded groups, the three overlay-modal states, import flag) and
// derives the effective selection in RENDER (React 19: NO useEffect+setState, NO ref read/write
// in render body). Handlers only set state on user interaction. Generate / edit-entity / Excel
// import / edit-image binding land in Phase 06 — here the handlers just populate the modal state
// and the overlays region is a set of mount-point stubs.

import { useCallback, useMemo, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  useSketchBaseStyles,
  useSketchBaseEntityKeys,
  useBaseSheetGenerateStatus,
  useBaseSheetGenerateOp,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { useSketchStyleId } from '@/stores/book-store';
import type { BaseKind, SketchBaseStyle } from '@/types/sketch';
import { createLogger } from '@/utils/logger';
import { BaseKindSidebar } from './base-kind-sidebar';
import { BaseSheetContentArea } from './base-sheet-content-area';
import { GenerateStyleModal } from './generate-style-modal';
import { EditBaseEntityModal } from './edit-base-entity-modal';
import { SketchBaseEditImageModal } from './sketch-base-edit-image-modal';
import { importBaseEntities, type BaseImportParse } from './import/parse-base-entities';
import {
  KIND_GROUPS,
  ZOOM,
  nounForKind,
  pickFirstAvailable,
  type EditImageTarget,
  type EditEntityModalState,
  type GenerateModalState,
  type SelectedStyleRef,
} from './sketch-base-constants';

const log = createLogger('Editor', 'SketchBaseSpace');

export function SketchBaseSpace() {
  const charStyles = useSketchBaseStyles('characters');
  const propStyles = useSketchBaseStyles('props');
  // book.sketchstyle_id (art_styles.type=0) — REQUIRED to generate; the modal gates on it.
  const artStyleId = useSketchStyleId();
  const { setSketchBaseStyleSelected, setSketchBaseEntities, autoSaveSnapshot } = useSnapshotActions();
  // Base entity keys per kind — drive the content-area crop cards AND the import replace-confirm.
  const charEntityKeys = useSketchBaseEntityKeys('characters');
  const propEntityKeys = useSketchBaseEntityKeys('props');
  const hasExistingEntities = charEntityKeys.length > 0 || propEntityKeys.length > 0;

  // ── Local UI state (owner = this root; state-location rule) ────────────────────────────────
  const [selectedStyle, setSelectedStyle] = useState<SelectedStyleRef | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'crop'>('raw');
  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [expandedGroups, setExpandedGroups] = useState<Record<BaseKind, boolean>>({
    characters: true,
    props: true,
  });
  // Phase 06 overlay states — populated by the handlers below, consumed by the mount points.
  const [generateModal, setGenerateModal] = useState<GenerateModalState | null>(null);
  const [editEntityModal, setEditEntityModal] = useState<EditEntityModalState | null>(null);
  const [editImageTarget, setEditImageTarget] = useState<EditImageTarget | null>(null);
  // Import spinner flag + pending parse awaiting a replace confirm (when entities already exist).
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<BaseImportParse | null>(null);

  const stylesByKind = useMemo<Record<BaseKind, SketchBaseStyle[]>>(
    () => ({ characters: charStyles, props: propStyles }),
    [charStyles, propStyles],
  );

  // Auto-select is DERIVED (React 19: never set state in render): keep the user's choice while it
  // is still in-range, otherwise fall back to the first available style. When a style is
  // deleted/lock changes, this recomputes to a valid target with no effect + no loop.
  const effectiveSelected = useMemo<SelectedStyleRef | null>(() => {
    if (selectedStyle && stylesByKind[selectedStyle.kind][selectedStyle.index]) return selectedStyle;
    return pickFirstAvailable(charStyles, propStyles);
  }, [selectedStyle, stylesByKind, charStyles, propStyles]);

  const activeKind = effectiveSelected?.kind ?? 'characters';
  const entityKeys = activeKind === 'characters' ? charEntityKeys : propEntityKeys;
  const genStatus = useBaseSheetGenerateStatus(activeKind, effectiveSelected?.index ?? -1);
  // Single-flight op (drives the sidebar per-row spinner across BOTH kinds).
  const generateOp = useBaseSheetGenerateOp();
  const style = effectiveSelected ? stylesByKind[effectiveSelected.kind][effectiveSelected.index] : null;

  // ── Handlers (set state only; Phase 06 fills the modal side effects) ────────────────────────
  const handleSelectStyle = useCallback((kind: BaseKind, index: number) => {
    setSelectedStyle({ kind, index });
  }, []);

  // Enqueued by GenerateStyleModal with the target style index → select it + show the Raw tab so the
  // content-area "Generating…" overlay tracks the (possibly newly-appended) style. Handler-driven
  // setState (React 19-safe — never in render).
  const handleEnqueued = useCallback((kind: BaseKind, index: number) => {
    log.info('handleEnqueued', 'select enqueued style', { kind, index });
    setSelectedStyle({ kind, index });
    setActiveTab('raw');
  }, []);

  const handleToggleGroup = useCallback((kind: BaseKind) => {
    setExpandedGroups((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  const handleAddStyle = useCallback(
    (kind: BaseKind) => {
      log.info('handleAddStyle', 'open generate modal (add)', { kind, hasArtStyle: artStyleId != null });
      setGenerateModal({ kind, mode: 'add' });
    },
    [artStyleId],
  );

  // Lock = exclusive-idempotent (clears others in the SAME sheet + clones crops → base variant).
  // Clicking an already-locked style re-sets itself (no-op). No unlock-to-0 (Validation S1).
  const handleLockStyle = useCallback(
    (kind: BaseKind, index: number) => {
      log.info('handleLockStyle', 'lock style', { kind, index });
      setSketchBaseStyleSelected(kind, index);
    },
    [setSketchBaseStyleSelected],
  );

  const handleEditEntity = useCallback((kind: BaseKind) => {
    setEditEntityModal({ kind });
  }, []);

  // Commit a parsed import: bulk-replace char + prop entities, fire-and-forget autosave for
  // durability (base collab-lock not designed yet), then surface warnings + a success toast.
  const commitImport = useCallback(
    (parse: BaseImportParse) => {
      setSketchBaseEntities(parse.result);
      void autoSaveSnapshot();
      const count = parse.result.characters.length + parse.result.props.length;
      if (parse.issues.warnings.length > 0) {
        log.warn('commitImport', 'import warnings', { count: parse.issues.warnings.length });
        toast.warning(`${parse.issues.warnings.length} import warning(s) — see console`);
        for (const w of parse.issues.warnings) log.warn('commitImport', 'warning', { message: w });
      }
      log.info('commitImport', 'applied base entities', { count });
      toast.success(`Imported ${count} base entities`);
    },
    [setSketchBaseEntities, autoSaveSnapshot],
  );

  // Excel import: parse (client-side, no raw upload) → block on errors → confirm replace when
  // entities already exist, else commit directly. Input value is reset by the sidebar.
  const handleImport = useCallback(
    async (file: File) => {
      setIsImporting(true);
      try {
        const parse = await importBaseEntities(file);
        if (parse.issues.errors.length > 0) {
          log.warn('handleImport', 'blocking errors', { errors: parse.issues.errors });
          toast.error(parse.issues.errors[0]);
          return;
        }
        if (hasExistingEntities) {
          setPendingImport(parse);
        } else {
          commitImport(parse);
        }
      } catch (err) {
        log.error('handleImport', 'parse failed', { error: String(err) });
        toast.error('Could not read the Excel file');
      } finally {
        setIsImporting(false);
      }
    },
    [hasExistingEntities, commitImport],
  );

  const confirmImport = useCallback(() => {
    if (pendingImport) commitImport(pendingImport);
    setPendingImport(null);
  }, [pendingImport, commitImport]);

  const handleEditRaw = useCallback(() => {
    if (!effectiveSelected) return;
    setEditImageTarget({ kind: effectiveSelected.kind, styleIndex: effectiveSelected.index, scope: 'raw' });
  }, [effectiveSelected]);

  const handleEditCrop = useCallback(
    (entityKey: string) => {
      if (!effectiveSelected) return;
      setEditImageTarget({
        kind: effectiveSelected.kind,
        styleIndex: effectiveSelected.index,
        scope: 'crop',
        entityKey,
      });
    },
    [effectiveSelected],
  );

  return (
    <main className="flex h-full" role="main" aria-label="Sketch base creative space">
      <BaseKindSidebar
        groups={KIND_GROUPS}
        stylesByKind={stylesByKind}
        selectedStyle={effectiveSelected}
        expandedGroups={expandedGroups}
        onSelectStyle={handleSelectStyle}
        onToggleGroup={handleToggleGroup}
        onAddStyle={handleAddStyle}
        onLockStyle={handleLockStyle}
        onEditEntity={handleEditEntity}
        onImport={handleImport}
        isImporting={isImporting}
        generateOp={generateOp}
      />

      <div className="flex flex-1 min-w-[480px] overflow-hidden">
        {effectiveSelected && style ? (
          <BaseSheetContentArea
            selectedStyle={effectiveSelected}
            style={style}
            entityKeys={entityKeys}
            noun={nounForKind(effectiveSelected.kind)}
            activeTab={activeTab}
            zoom={zoom}
            isGenerating={genStatus.isGenerating}
            onChangeTab={setActiveTab}
            onChangeZoom={setZoom}
            onEditRaw={handleEditRaw}
            onEditCrop={handleEditCrop}
          />
        ) : (
          <EmptyState onAddStyle={() => handleAddStyle('characters')} />
        )}
      </div>

      {/* Overlays (mount by state). Generate enqueues an async job then closes immediately; edit
          modals write text/illustrations through the slice; EditImageModal is store-bound by scope. */}
      {generateModal && (
        <GenerateStyleModal
          kind={generateModal.kind}
          mode={generateModal.mode}
          styleIndex={generateModal.styleIndex}
          onEnqueued={handleEnqueued}
          onClose={() => setGenerateModal(null)}
        />
      )}
      {editEntityModal && (
        <EditBaseEntityModal kind={editEntityModal.kind} onClose={() => setEditEntityModal(null)} />
      )}
      {editImageTarget && (
        <SketchBaseEditImageModal target={editImageTarget} onClose={() => setEditImageTarget(null)} />
      )}

      {/* Replace-confirm before a bulk import overwrites existing char + prop base entities. */}
      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace base entities?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces all existing character and prop base entities with{' '}
              {(pendingImport?.result.characters.length ?? 0) + (pendingImport?.result.props.length ?? 0)} from the
              file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** Shown when no style exists in either sheet yet (nothing imported / generated). */
function EmptyState({ onAddStyle }: { onAddStyle: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Upload className="h-10 w-10 opacity-60" aria-hidden="true" />
      <div>
        <p className="text-sm">No base sheet yet</p>
        <p className="mt-1 text-xs">Import base entities from the sidebar, then add a style to generate.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onAddStyle}>
        <Plus className="mr-1.5 h-4 w-4" />
        Add style
      </Button>
    </div>
  );
}
