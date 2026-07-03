// sketch-spread-canvas.tsx — dedicated single-spread canvas for the sketch-spread creative space.
//
// Renders ONE sketch spread in a fit-to-screen frame (trim-size aspect, no bleed, no staging,
// overflow:hidden). Owns its own selection state (the role the shared SpreadEditorPanel plays
// elsewhere). Reuses leaf items — PageItem (bg + page number, non-selectable), SelectionFrame +
// EditableTextbox + SpreadsTextToolbar (editable) — and a plain-<img> LockedPageImage for the
// per-page backdrops (validation session 1: NOT EditableImage).
//
// Interaction model:
//  - Page images: LOCKED (plain <img> cover, pointer-events:none) — never selectable/draggable.
//  - Textboxes: select / drag / resize (hard-clamped to [0,100], min 5%) / inline-edit / toolbar /
//    delete. NO rotate, NO add-textbox. Per-language via the current header language.
//  - Keyboard (local, only when a textbox is selected & not editing): Delete/Backspace → delete,
//    Escape → deselect, Arrow → nudge 1% (Shift 10%).
//
// NOT wired into sketch-spread-content-area here — that is Phase 04. This component only needs to
// compile + lint clean standalone.

'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageItem } from '@/features/editor/components/canvas-spread-view/page-item';
import { SelectionFrame } from '@/features/editor/components/canvas-spread-view/selection-frame';
import { clamp } from '@/features/editor/components/canvas-spread-view/utils/coordinate-utils';
import { applyResizeDelta } from '@/features/editor/components/canvas-spread-view/utils/geometry-utils';
import { EditableTextbox } from '@/features/editor/components/shared-components';
import { SpreadsTextToolbar } from '@/features/editor/components/spreads-creative-space/spreads-text-toolbar';
import {
  useSketchSpreadById,
  useSketchSpreadIds,
  useSketchSpreadGenerating,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import {
  useTrimSize,
  useSetZoomLevel,
  useLanguageCode,
} from '@/stores/editor-settings-store';
import { CANVAS, LAYER_CONFIG } from '@/constants/spread-constants';
import {
  SKETCH_PAGE_GEOMETRY,
  getSketchSpreadPageImageUrl,
  getSketchTextboxContent,
} from '@/types/sketch';
import type { SketchTextbox, SketchTextboxContent } from '@/types/sketch';
import type {
  BaseSpread,
  Geometry,
  PageData,
  ResizeHandle,
  SpreadTextbox,
  TextToolbarContext,
  Typography,
} from '@/types/canvas-types';
import type { SpreadTextboxContent } from '@/types/spread-types';
import { createLogger } from '@/utils/logger';
import { LockedPageImage } from './sketch-spread-canvas-page-image';
import { computeSketchPageNumbers } from './compute-sketch-page-numbers';

const log = createLogger('Editor', 'SketchSpreadCanvas');

// Nudge steps (locked decision phase-03): 1% normally, 10% with Shift.
// (CANVAS.NUDGE_STEP = 1 is reused; the Shift step is 10 here, not CANVAS.NUDGE_STEP_SHIFT=5.)
const NUDGE_STEP = CANVAS.NUDGE_STEP;
const NUDGE_STEP_SHIFT = 10;
// Min textbox size (%) — matches CANVAS.MIN_ELEMENT_SIZE.
const MIN_TEXTBOX_SIZE = CANVAS.MIN_ELEMENT_SIZE;

/** Hard-clamp a textbox geometry to the visible frame [0,100] with a 5% min size.
 *  The sketch canvas has NO staging (unlike SpreadEditorPanel's soft ±50% bounds). */
function clampTextboxGeometryToFrame(g: Geometry): Geometry {
  const w = clamp(g.w, MIN_TEXTBOX_SIZE, 100);
  const h = clamp(g.h, MIN_TEXTBOX_SIZE, 100);
  const x = clamp(g.x, 0, 100 - w);
  const y = clamp(g.y, 0, 100 - h);
  return { ...g, x, y, w, h };
}

/** Minimal PageData for the non-interactive PageItem (bg + page number only). */
function makePageData(number: number): PageData {
  return { number, type: 'normal_page', layout: null, background: { color: '#ffffff', texture: null } };
}

/** Visual-only vertical spine at 50% (pointer-events:none). */
function SpineDivider() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0"
      style={{
        left: '50%',
        width: 1,
        transform: 'translateX(-0.5px)',
        backgroundColor: 'rgba(0,0,0,0.12)',
        zIndex: 1,
      }}
    />
  );
}

export interface SketchSpreadCanvasProps {
  spreadId: string;
}

export function SketchSpreadCanvas({ spreadId }: SketchSpreadCanvasProps) {
  const spread = useSketchSpreadById(spreadId);
  const trim = useTrimSize();
  const langCode = useLanguageCode();
  const focusGen = useSketchSpreadGenerating(spreadId);
  const spreadIds = useSketchSpreadIds();
  const { updateSketchTextbox, deleteSketchTextbox } = useSnapshotActions();
  const setZoomLevel = useSetZoomLevel();

  const frameRef = useRef<HTMLDivElement>(null);
  // Latest committed-pending geometry during an active drag/resize — read only in handlers.
  const latestGeoRef = useRef<Geometry | null>(null);

  const [selectedTextboxId, setSelectedTextboxId] = useState<string | null>(null);
  const [editingTextboxId, setEditingTextboxId] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  // Live drag/resize preview (local) — committed to the store on END (not per-frame).
  const [previewGeometry, setPreviewGeometry] = useState<Geometry | null>(null);

  // Broadcast zoom=100 on mount so reused EditableTextbox/SelectionFrame read the right scale
  // instead of a stale value left by another creative space (insight #1). This calls the store
  // setter (not local setState) — allowed as a mount effect under React-19 rules.
  useEffect(() => {
    log.info('mount', 'sketch spread canvas mounted', { spreadId });
    setZoomLevel(100);
  }, [setZoomLevel, spreadId]);

  const pageNos = useMemo(
    () => computeSketchPageNumbers(spreadIds, spreadId),
    [spreadIds, spreadId],
  );

  const deselect = useCallback(() => {
    setSelectedTextboxId(null);
    setEditingTextboxId(null);
    setPreviewGeometry(null);
    setActiveHandle(null);
    // Drop any in-flight drag geometry so a stale value can't commit onto the next selection
    // if the SelectionFrame unmounts mid-drag (selection flips before onDragEnd fires).
    latestGeoRef.current = null;
  }, []);

  const commitGeometry = useCallback(
    (textboxId: string) => {
      const geo = latestGeoRef.current;
      if (geo) {
        log.debug('commitGeometry', 'commit textbox geometry', { textboxId });
        updateSketchTextbox(spreadId, textboxId, langCode, { geometry: geo });
      }
      latestGeoRef.current = null;
      setPreviewGeometry(null);
      // Re-focus the frame so local keyboard (nudge/delete/deselect) stays live after a Moveable
      // drag/resize, which can pull focus out of the textbox subtree.
      frameRef.current?.focus();
    },
    [spreadId, langCode, updateSketchTextbox],
  );

  const handleFramePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Empty-frame click (page items + images are pointer-events:none → event.target === frame).
      if (e.target === e.currentTarget) {
        log.debug('handleFramePointerDown', 'empty frame → deselect');
        deselect();
      }
    },
    [deselect],
  );

  // Local keyboard handler (bubbles from the focused textbox). Only acts when a textbox is
  // selected and NOT in inline-edit. Delete/Backspace → delete, Escape → deselect, Arrow → nudge.
  const handleFrameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectedTextboxId || editingTextboxId) return;

      // Escape always clears the (possibly stale) selection.
      if (e.key === 'Escape') {
        e.preventDefault();
        deselect();
        return;
      }

      // Resolve the selected textbox's content in the CURRENT language BEFORE any mutation. If it
      // has none (e.g. after a header language switch), the textbox isn't visible/selectable here
      // → ignore Delete/Arrow so we can't mutate an off-screen item (which would drop ALL languages).
      const tb = spread?.textboxes.find((t) => t.id === selectedTextboxId);
      const content = tb ? getSketchTextboxContent(tb, langCode) : undefined;
      if (!content) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        log.info('handleFrameKeyDown', 'delete selected textbox', { textboxId: selectedTextboxId });
        deleteSketchTextbox(spreadId, selectedTextboxId);
        deselect();
        return;
      }

      const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        default: return;
      }
      e.preventDefault();
      const next = clampTextboxGeometryToFrame({
        ...content.geometry,
        x: content.geometry.x + dx,
        y: content.geometry.y + dy,
      });
      updateSketchTextbox(spreadId, selectedTextboxId, langCode, { geometry: next });
    },
    [selectedTextboxId, editingTextboxId, spread, langCode, spreadId, deselect, deleteSketchTextbox, updateSketchTextbox],
  );

  if (!spread) {
    log.debug('render', 'no spread — render null', { spreadId });
    return null;
  }

  // Minimal BaseSpread-ish object for the non-interactive PageItem layout-lock check
  // (reads pages/images/textboxes). Empty images/textboxes ⇒ layout never locked (unused anyway
  // since we omit renderPageToolbar → non-selectable).
  const leftPage = makePageData(pageNos.left);
  const rightPage = makePageData(pageNos.right);
  const pageSpread = {
    id: spreadId,
    pages: [leftPage, rightPage],
    images: [],
    textboxes: [],
  } as unknown as BaseSpread;

  const ratio = trim.width / trim.height;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ containerType: 'size' }}
    >
      <div
        ref={frameRef}
        role="group"
        aria-label={`Sketch spread pages ${pageNos.left}–${pageNos.right}`}
        tabIndex={-1}
        onPointerDown={handleFramePointerDown}
        onKeyDown={handleFrameKeyDown}
        className="relative overflow-hidden bg-white shadow-md outline-none"
        style={{
          aspectRatio: `${trim.width} / ${trim.height}`,
          // Largest ratio-preserving box that fits the container (contain), CSS-only.
          width: `min(100cqw, ${ratio} * 100cqh)`,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* --- Page layer (always 2, even for a 'full' spread) --- */}
        <PageItem
          page={leftPage}
          pageIndex={0}
          spread={pageSpread}
          spreadId={spreadId}
          position="left"
          isSelected={false}
          onUpdatePage={() => {}}
          availableLayouts={[]}
        />
        <PageItem
          page={rightPage}
          pageIndex={1}
          spread={pageSpread}
          spreadId={spreadId}
          position="right"
          isSelected={false}
          onUpdatePage={() => {}}
          availableLayouts={[]}
        />
        <SpineDivider />

        {/* --- Image layer (per page type; locked plain <img> cover) --- */}
        {spread.pages.map((p, i) => {
          const geometry = SKETCH_PAGE_GEOMETRY[p.type];
          if (!geometry) return null; // guard a corrupt page type (unvalidated in normalizer)
          const url = getSketchSpreadPageImageUrl(spread, p.type);
          return (
            <LockedPageImage
              key={`${p.type}-${url ?? 'none'}`}
              geometry={geometry}
              url={url}
              generating={focusGen.isGenerating}
              ordinal={i + 1}
            />
          );
        })}

        {/* --- Textbox layer (per-language; selectable/editable) --- */}
        {spread.textboxes.map((tb: SketchTextbox, i) => {
          const content = getSketchTextboxContent(tb, langCode);
          if (!content) return null; // no content for the current language → skip

          const isSel = tb.id === selectedTextboxId;
          const isEdit = tb.id === editingTextboxId;
          const displayGeometry = isSel && previewGeometry ? previewGeometry : content.geometry;
          // During a live drag/resize the textbox renders at the preview geometry so it moves with
          // the SelectionFrame; the store write happens once on END (commitGeometry).
          const displayContent: SpreadTextboxContent =
            displayGeometry === content.geometry
              ? (content as SpreadTextboxContent)
              : ({ ...content, geometry: displayGeometry } as SpreadTextboxContent);

          const startGeometry = content.geometry;

          const toolbarContext: TextToolbarContext<BaseSpread> = {
            item: tb as unknown as SpreadTextbox,
            itemIndex: i,
            spreadId,
            spread: spread as unknown as BaseSpread,
            isSelected: true,
            isSpreadSelected: true,
            selectedGeometry: displayGeometry,
            canvasRef: frameRef,
            onSelect: () => setSelectedTextboxId(tb.id),
            onTextChange: (text: string) =>
              updateSketchTextbox(spreadId, tb.id, langCode, { text }),
            // Toolbar geometry edits emit { [langCode]: fullContent }; unwrap → per-language patch.
            onUpdate: (updates: Partial<SpreadTextbox>) => {
              const c = (updates as Record<string, unknown>)[langCode];
              if (c && typeof c === 'object') {
                updateSketchTextbox(spreadId, tb.id, langCode, c as SketchTextboxContent);
              }
            },
            onFormatText: (format: Partial<Typography>) =>
              updateSketchTextbox(spreadId, tb.id, langCode, {
                typography: { ...content.typography, ...format },
              }),
            onDelete: () => {
              log.info('onDelete', 'delete textbox via toolbar', { textboxId: tb.id });
              deleteSketchTextbox(spreadId, tb.id);
              deselect();
            },
            onEditText: () => setEditingTextboxId(tb.id),
            onEditingChange: (editing: boolean) => setEditingTextboxId(editing ? tb.id : null),
            isEditing: isEdit,
          };

          return (
            <Fragment key={tb.id}>
              <EditableTextbox
                textboxContent={displayContent}
                index={i}
                zIndex={LAYER_CONFIG.TEXT.min + i}
                isSelected={isSel}
                isSelectable
                isEditable
                isEditing={isEdit}
                onSelect={() => {
                  log.info('selectTextbox', 'textbox selected', { index: i });
                  setSelectedTextboxId(tb.id);
                }}
                onTextChange={(text) => updateSketchTextbox(spreadId, tb.id, langCode, { text })}
                onEditingChange={(editing) => setEditingTextboxId(editing ? tb.id : null)}
              />

              {isSel && !isEdit && (
                <>
                  <SelectionFrame
                    geometry={displayGeometry}
                    zIndex={LAYER_CONFIG.TEXT.max}
                    zoomLevel={100}
                    showHandles
                    showRotateHandle={false}
                    canDrag
                    canResize
                    canRotate={false}
                    activeHandle={activeHandle}
                    onDoubleClick={() => setEditingTextboxId(tb.id)}
                    onDragStart={() => {
                      log.debug('onDragStart', 'textbox drag start', { textboxId: tb.id });
                    }}
                    onDrag={(delta) => {
                      const next = clampTextboxGeometryToFrame({
                        ...startGeometry,
                        x: startGeometry.x + delta.x,
                        y: startGeometry.y + delta.y,
                      });
                      latestGeoRef.current = next;
                      setPreviewGeometry(next);
                    }}
                    onDragEnd={() => commitGeometry(tb.id)}
                    onResizeStart={(handle) => setActiveHandle(handle)}
                    onResize={(handle, delta) => {
                      const next = clampTextboxGeometryToFrame(
                        applyResizeDelta(startGeometry, handle, delta.x, delta.y),
                      );
                      latestGeoRef.current = next;
                      setPreviewGeometry(next);
                    }}
                    onResizeEnd={() => {
                      commitGeometry(tb.id);
                      setActiveHandle(null);
                    }}
                  />
                  <SpreadsTextToolbar<BaseSpread> context={toolbarContext} />
                </>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default SketchSpreadCanvas;
