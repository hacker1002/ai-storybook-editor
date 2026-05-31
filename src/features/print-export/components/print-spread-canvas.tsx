// print-spread-canvas.tsx — STATIC print/PDF render path for exactly one spread.
//
// Zero coupling to GSAP / playback / audio. Mirrors PlayerCanvas's static render
// blocks (pages, page-number, images, shapes, textboxes) but drops every dynamic
// concern: no refs, no click handlers, no videos/auto_pics/audios/quizzes/divider.
//
// Font/border scale ×4 (@300 DPI) is achieved purely by setting the global zoom
// to PRINT_RENDER_ZOOM (Editable* read useZoomLevel() internally) — no per-item
// scaling here. Composite/edition resolve is fixed to 'classic' (print = static
// raster, no edition-specific dynamic state — Validation S1).
"use client";

import { useEffect, useMemo } from "react";
import {
  EditableImage,
  EditableShape,
  EditableTextbox,
} from "@/features/editor/components/shared-components";
import { PageItem } from "@/features/editor/components/canvas-spread-view/page-item";
import { PageNumberingOverlay } from "@/features/editor/components/canvas-spread-view/page-numbering-overlay";
import {
  buildPlayerCompositeContextMap,
  resolveEffectiveZIndex,
} from "@/features/editor/utils/composite-resolve-helpers";
import { getScaledDimensions } from "@/features/editor/utils/coordinate-utils";
import {
  resolvePrintTextboxes,
  shouldRenderPrintImage,
  shouldRenderPrintShape,
} from "../utils/print-spread-items";
import { useCanvasSize, useSetZoomLevel } from "@/stores/editor-settings-store";
import { PRINT_RENDER_ZOOM } from "@/constants/playable-constants";
import { LAYER_CONFIG } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";
import type { PlayableSpread } from "@/types/playable-types";
import type { PageNumberingSettings } from "@/types/editor";

const log = createLogger("PrintExport", "PrintSpreadCanvas");

// Print = static classic raster → composite resolve is always 'classic'.
const PRINT_EDITION = "classic" as const;

export interface PrintSpreadCanvasProps {
  spread: PlayableSpread;
  languageKey: string;
  pageNumbering?: PageNumberingSettings | null;
}

export function PrintSpreadCanvas({
  spread,
  languageKey,
  pageNumbering,
}: PrintSpreadCanvasProps) {
  // ⚡ ADR-023: useCanvasSize() already returns full DPS + bleed
  // (DIMENSION_CANVAS_SIZE = single page × 2). Print ALWAYS renders the full DPS;
  // 'single' page extraction is a raster crop in the export job, not here.
  const { width: canvasWidth, height: canvasHeight } = useCanvasSize();
  const setZoom = useSetZoomLevel();

  // Drive the global zoom to 400 so Editable* scale fonts/borders ×4. No cleanup
  // (KISS) — the print route never mounts the editor concurrently, and the editor
  // re-sets zoom on its own mount.
  useEffect(() => {
    log.info("setZoom", "print render zoom applied", {
      spreadId: spread.id,
      zoom: PRINT_RENDER_ZOOM,
    });
    setZoom(PRINT_RENDER_ZOOM);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(
    canvasWidth,
    canvasHeight,
    PRINT_RENDER_ZOOM
  );

  // Composite resolve map fixed to 'classic' edition.
  const compositeCtxMap = useMemo(
    () =>
      buildPlayerCompositeContextMap(
        { composites: spread.composites },
        PRINT_EDITION
      ),
    [spread.composites]
  );

  // Resolve textbox content for the requested language; skip hidden/empty/staging.
  const textboxesWithLang = useMemo(
    () => resolvePrintTextboxes(spread.textboxes, languageKey),
    [spread.textboxes, languageKey]
  );

  log.info("render", "print spread canvas", {
    spreadId: spread.id,
    pageCount: spread.pages?.length ?? 0,
    imageCount: spread.images?.length ?? 0,
    shapeCount: spread.shapes?.length ?? 0,
    textboxCount: textboxesWithLang.length,
  });

  return (
    <div
      className="print-spread-canvas relative bg-white"
      style={{ width: scaledWidth, height: scaledHeight }}
    >
      {/* Pages */}
      {spread.pages?.map((page, pageIndex) => (
        <PageItem
          key={pageIndex}
          page={page}
          pageIndex={pageIndex}
          spread={spread}
          spreadId={spread.id}
          position={
            spread.pages.length === 1
              ? "single"
              : pageIndex === 0
              ? "left"
              : "right"
          }
          isSelected={false}
          onUpdatePage={() => {}}
          availableLayouts={[]}
        />
      ))}

      {/* Page number overlay */}
      {pageNumbering && pageNumbering.position !== "none" && (
        <PageNumberingOverlay
          pages={spread.pages}
          position={pageNumbering.position}
          color={pageNumbering.color}
          fontFamily={pageNumbering.font_family}
          fontSize={pageNumbering.font_size}
        />
      )}

      {/* Images — skip hidden / outside staging / off-edition composite / no-URL */}
      {spread.images?.map((image, index) => {
        if (!shouldRenderPrintImage(image, spread.composites, compositeCtxMap)) {
          return null;
        }
        return (
          <EditableImage
            key={image.id}
            image={image}
            index={index}
            zIndex={resolveEffectiveZIndex(
              { id: image.id, "z-index": image["z-index"] },
              compositeCtxMap
            )}
            isSelected={false}
            isSelectable={false}
            isEditable={false}
            onSelect={() => {}}
          />
        );
      })}

      {/* Shapes — skip hidden / outside staging */}
      {spread.shapes?.map((shape, index) => {
        if (!shouldRenderPrintShape(shape)) return null;
        return (
          <EditableShape
            key={shape.id}
            shape={shape}
            index={index}
            zIndex={shape["z-index"]}
            isSelected={false}
            isEditable={false}
            onSelect={() => {}}
          />
        );
      })}

      {/* Textboxes — resolved language content only */}
      {textboxesWithLang.map((item, index) => {
        if (!item) return null;
        const { textbox, data } = item;
        return (
          <EditableTextbox
            key={textbox.id}
            textboxContent={data}
            index={index}
            zIndex={textbox["z-index"] ?? LAYER_CONFIG.TEXT.min + index}
            isSelected={false}
            isSelectable={false}
            isEditable={false}
            onSelect={() => {}}
            onTextChange={() => {}}
            onEditingChange={() => {}}
          />
        );
      })}
    </div>
  );
}
