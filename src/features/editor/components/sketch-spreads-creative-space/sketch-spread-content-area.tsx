// sketch-spread-content-area.tsx — right panel of the sketch-spread space.
// Reuses CanvasSpreadView via the SketchSpread→BaseSpread adapter (single-spread focus).
//
// Interaction model (validation decisions):
//  - Backdrop image: SELECTABLE, but drag/resize LOCKED. Selecting it shows a remix-style
//    image toolbar (Extract + Edit — STUB actions this pass).
//  - Textbox: fully editable (double-click text edit + drag/resize) — writes commit to the
//    sketch store per-language via updateSketchTextbox / deleteSketchTextbox.
//  - Generate: STUB button (endpoint TBD).
//
// Per-item drag/resize gating (SPIKE result): CanvasSpreadView's canDragItem/canResizeItem are
// panel-wide, but the SelectionFrame only applies them to the *currently selected* item. So we
// drive those booleans from the selected item's TYPE (captured by wrapping each render-prop's
// onSelect) → image locked, textbox free, with no custom SelectionFrame.

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
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
import { CanvasSpreadView } from '@/features/editor/components/canvas-spread-view';
import { EditableImage, EditableTextbox } from '@/features/editor/components/shared-components';
import { SpreadsTextToolbar } from '@/features/editor/components/spreads-creative-space/spreads-text-toolbar';
import { getTextboxContentForLanguage } from '@/features/editor/utils/textbox-helpers';
import { useSnapshotStore } from '@/stores/snapshot-store';
import {
  useSketchSpreadById,
  useSnapshotActions,
  useIsSketchSpreadGenerating,
  useSketchSpreadGenerateProgress,
  useIsAnySketchGenerating,
  useSketchSpreadGenerating,
} from '@/stores/snapshot-store/selectors';
import { useCurrentBook, useBookTemplateLayout, useBookTypography } from '@/stores/book-store';
import { createLogger } from '@/utils/logger';
import type {
  ItemType,
  ImageItemContext,
  TextItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  SpreadItemActionUnion,
} from '@/types/canvas-types';
import type { BaseSpread, SpreadTextbox } from '@/types/spread-types';
import type { SketchTextboxContent } from '@/types/sketch';
import { getSketchSpreadEffectiveUrl } from '@/types/sketch';
import { toBaseSpread } from './sketch-spread-to-base-spread-adapter';
import { SketchSpreadImageToolbar } from './sketch-spread-image-toolbar';

const log = createLogger('Editor', 'SketchSpreadContentArea');

const RENDER_ITEMS: ItemType[] = ['image', 'textbox'];

export interface SketchSpreadContentAreaProps {
  spreadId: string;
  /** Bulk-selected spread ids from the sidebar (checkbox multi-select). Generate targets these
   *  when non-empty, else the single focused spread. Threaded from the parent creative space. */
  checkedSpreadIds: string[];
}

type SelectedItemType = 'image' | 'textbox' | null;

export function SketchSpreadContentArea({ spreadId, checkedSpreadIds }: SketchSpreadContentAreaProps) {
  const spread = useSketchSpreadById(spreadId);
  const book = useCurrentBook();
  const bookTypography = useBookTypography();
  const pageNumbering = useBookTemplateLayout()?.page_numbering;
  const {
    updateSketchTextbox,
    deleteSketchTextbox,
    startSketchSpreadGenerateJob,
    cancelSketchSpreadGenerateJob,
  } = useSnapshotActions();

  // Generate-job state (1 sketch job global). `anyGen` disables Generate while EITHER sketch job
  // (entity-sheet or spread-image) runs; isSpreadJob/progress/focusGen reflect the spread job.
  const isSpreadJob = useIsSketchSpreadGenerating();
  const progress = useSketchSpreadGenerateProgress();
  const anyGen = useIsAnySketchGenerating();
  const focusGen = useSketchSpreadGenerating(spreadId);
  const [pendingTarget, setPendingTarget] = useState<string[] | null>(null);

  // Content language is locked to the book's original language (NOT the editor language).
  const langCode = book?.original_language;

  // Fixed single-spread focus view — no zoom control (design intent).
  const [zoomLevel, setZoomLevel] = useState(100);
  // Selected item TYPE drives per-item drag/resize gating (see file header).
  const [selectedItemType, setSelectedItemType] = useState<SelectedItemType>(null);

  // Generate target: bulk-checked spreads if any, else the focused spread (job slice sorts doc-order).
  const target = checkedSpreadIds.length > 0 ? checkedSpreadIds : [spreadId];
  const canGenerate = !anyGen && Boolean(book?.artstyle_id) && target.length > 0;
  const label = isSpreadJob
    ? `Generating… (${progress?.done ?? 0}/${progress?.total ?? 0})`
    : checkedSpreadIds.length > 0
      ? `Generate (${checkedSpreadIds.length})`
      : 'Generate';

  const base = useMemo<BaseSpread | null>(
    () => (spread ? toBaseSpread(spread) : null),
    [spread],
  );

  // Route canvas item writes to the sketch store. Only textbox is editable; image is locked
  // and Generate/Extract/Edit are stubs, so image/page updates are intentionally ignored.
  const handleSpreadItemAction = useCallback(
    (params: SpreadItemActionUnion) => {
      const { spreadId: sid, itemType, action, itemId, data } = params;
      if (itemType !== 'textbox' || !langCode) {
        log.debug('handleSpreadItemAction', 'ignored', { itemType, action });
        return;
      }
      if (action === 'delete') {
        log.info('handleSpreadItemAction', 'delete textbox', { spreadId: sid, textboxId: itemId });
        deleteSketchTextbox(sid, String(itemId));
        return;
      }
      if (action === 'update') {
        // Panel emits localized patches: data = { [langCode]: { text, geometry, typography } }.
        const patch = data as Partial<SpreadTextbox> | null;
        const content = patch?.[langCode];
        if (content && typeof content === 'object') {
          log.debug('handleSpreadItemAction', 'update textbox', { spreadId: sid, textboxId: itemId });
          updateSketchTextbox(sid, String(itemId), langCode, content as SketchTextboxContent);
        }
      }
    },
    [langCode, updateSketchTextbox, deleteSketchTextbox],
  );

  const handleGenerate = () => {
    log.info('handleGenerate', 'start', { targetCount: target.length });
    if (!book?.artstyle_id) {
      log.debug('handleGenerate', 'blocked — no art style');
      toast.warning('Set an art style for this book first');
      return;
    }
    if (target.length === 0) {
      toast.info('Nothing to generate');
      return;
    }
    // Resolve "already has an image" at click-time via getState() (NOT a hook — React 19 forbids
    // hooks in callbacks). Any target with an effective backdrop url triggers the regen confirm.
    const spreads = useSnapshotStore.getState().sketch.spreads;
    const hadExisting = target.some((id) => {
      const s = spreads.find((x) => x.id === id);
      return s ? getSketchSpreadEffectiveUrl(s) != null : false;
    });
    if (hadExisting) {
      setPendingTarget(target); // open regenerate confirm
    } else {
      startSketchSpreadGenerateJob({ spreadIds: target, artStyleId: book.artstyle_id });
    }
  };

  const confirmRegenerate = () => {
    if (pendingTarget && book?.artstyle_id) {
      log.info('confirmRegenerate', 'regenerate confirmed', { count: pendingTarget.length });
      startSketchSpreadGenerateJob({ spreadIds: pendingTarget, artStyleId: book.artstyle_id });
    }
    setPendingTarget(null);
  };

  const renderImageItem = useCallback(
    (ctx: ImageItemContext<BaseSpread>) => (
      // Selectable (isSelectable) but NOT double-click editable; drag/resize is gated OFF via
      // canDragItem/canResizeItem while an image is the selected item.
      <EditableImage
        image={ctx.item}
        index={ctx.itemIndex}
        zIndex={ctx.zIndex}
        isSelected={ctx.isSelected}
        isSelectable={ctx.isSpreadSelected}
        isEditable={false}
        onSelect={() => {
          setSelectedItemType('image');
          ctx.onSelect();
        }}
      />
    ),
    [],
  );

  const renderImageToolbar = useCallback(
    (ctx: ImageToolbarContext<BaseSpread>) => (
      <SketchSpreadImageToolbar
        context={{
          item: ctx.item,
          selectedGeometry: ctx.selectedGeometry,
          canvasRef: ctx.canvasRef,
          onExtract: () => toast.info('Extract — coming soon.'),
          onEdit: () => toast.info('Edit — coming soon.'),
        }}
      />
    ),
    [],
  );

  const renderTextItem = useCallback(
    (ctx: TextItemContext<BaseSpread>) => {
      const result = getTextboxContentForLanguage(
        ctx.item as unknown as Record<string, unknown>,
        langCode ?? '',
        bookTypography,
      );
      if (!result) return null;
      const { langKey, content } = result;
      return (
        <EditableTextbox
          textboxContent={content}
          index={ctx.itemIndex}
          zIndex={ctx.zIndex}
          isSelected={ctx.isSelected}
          isSelectable={ctx.isSpreadSelected}
          isEditable={ctx.isSpreadSelected}
          isEditing={ctx.isEditing}
          onSelect={() => {
            setSelectedItemType('textbox');
            ctx.onSelect();
          }}
          onTextChange={(newText) =>
            ctx.onUpdate({ [langKey]: { ...content, text: newText } } as unknown as Partial<SpreadTextbox>)
          }
          onEditingChange={ctx.onEditingChange ?? (() => {})}
        />
      );
    },
    [langCode, bookTypography],
  );

  const renderTextToolbar = useCallback(
    (ctx: TextToolbarContext<BaseSpread>) => <SpreadsTextToolbar context={ctx} />,
    [],
  );

  // Race guard: parent re-focuses after a delete, but render null defensively.
  if (!spread || !base) {
    log.debug('render', 'spread missing — render null', { spreadId });
    return null;
  }

  const canEditSelected = selectedItemType === 'textbox';

  return (
    <section className="flex flex-1 flex-col overflow-hidden" role="region" aria-label="Spread canvas">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
          aria-busy={isSpreadJob}
          aria-label={label}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {label}
        </Button>
        {isSpreadJob && (
          <Button
            variant="outline"
            size="sm"
            onClick={cancelSketchSpreadGenerateJob}
            aria-label="Cancel generation"
          >
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>

      <div className="relative flex-1 overflow-auto">
        <CanvasSpreadView<BaseSpread>
          spreads={[base]}
          selectedSpreadId={base.id}
          viewMode="edit"
          zoomLevel={zoomLevel}
          columnsPerRow={1}
          onSpreadSelect={() => {}}
          onViewModeChange={() => {}}
          onZoomChange={setZoomLevel}
          onColumnsChange={() => {}}
          onUpdateSpreadItem={handleSpreadItemAction}
          onDeselect={() => setSelectedItemType(null)}
          // Belt-and-suspenders for the drag/resize gate: the normal path updates
          // selectedItemType via each render-prop's wrapped onSelect, but the smart-hit-test
          // path (inert here — prop not passed) selects via onCanvasItemSelect instead. Wiring
          // it too keeps the image locked / textbox free if smart hit-test is ever enabled.
          onCanvasItemSelect={(sel) =>
            setSelectedItemType(sel.type === 'textbox' ? 'textbox' : sel.type === 'image' ? 'image' : null)
          }
          isEditable
          canAddSpread={false}
          canDeleteSpread={false}
          canReorderSpread={false}
          canDragItem={canEditSelected}
          canResizeItem={canEditSelected}
          showViewToggle={false}
          renderItems={RENDER_ITEMS}
          renderImageItem={renderImageItem}
          renderImageToolbar={renderImageToolbar}
          renderTextItem={renderTextItem}
          renderTextToolbar={renderTextToolbar}
          pageNumbering={pageNumbering ?? undefined}
          forceLanguageCode={langCode}
        />

        {/* Spinner overlay while the FOCUSED spread is being generated. */}
        {focusGen.isGenerating && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70"
            role="status"
            aria-label="Generating spread image"
          >
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Generating spread image…</p>
          </div>
        )}
      </div>

      {/* Regenerate confirm — mirrors the sidebar delete-confirm / entity-space regen dialog. */}
      <AlertDialog open={pendingTarget !== null} onOpenChange={(open) => !open && setPendingTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate spreads?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTarget?.length ?? 0} spread(s) already have a generated image. Regenerating
              creates a new version and selects it as the backdrop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
