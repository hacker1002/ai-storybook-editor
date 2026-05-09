// animation-editor-canvas.tsx - Main canvas for animation editor mode
"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from "react";
import {
  EditableTextbox,
  EditableImage,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableQuiz,
  EditableAutoPic,
  EditableAutoAudio,
} from "../shared-components";
import { getScaledDimensions } from "../../utils/coordinate-utils";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import type { Geometry, ItemType, SpreadAnimation } from "@/types/spread-types";
import {
  useLanguageCode,
  useCanvasWidth,
  useCanvasHeight,
} from "@/stores/editor-settings-store";
import { useZoomCenterScroll } from "../../hooks/use-zoom-center-scroll";
import { PageItem } from "../canvas-spread-view/page-item";
import { SelectionOverlay } from "./selection-overlay";
import { LAYER_CONFIG, Z_INDEX } from "@/constants/spread-constants";
import type { PlayableSpread } from "@/types/playable-types";
import type { PageNumberingSettings } from "@/types/editor";
import { PageNumberingOverlay } from "../canvas-spread-view/page-numbering-overlay";
import { createLogger } from "@/utils/logger";
import { isItemPlayerVisible } from "./visibility-utils";
import { CompositeMemberBadge } from "../objects-creative-space/composite-member-badge";
import {
  buildCompositeNumberMap,
  findCompositeIdForVariant,
  resolveTargetItemGeometry,
} from "../../utils/composite-resolve-helpers";
import { ZoomAreaOverlay } from "./zoom-area-overlay";
import { DrawZoomAreaSurface } from "./draw-zoom-area-surface";
import { MotionLineOverlay } from "./motion-line-overlay";
import type { ZoomAreaGeometry } from "./zoom-area-overlay-utils";
import type { MotionLineGeometry } from "./motion-line-overlay-utils";

const log = createLogger("Editor", "AnimationEditorCanvas");

// === Props Interface ===
export interface AnimationEditorCanvasProps {
  spread: PlayableSpread;
  zoomLevel: number;
  selectedItemId?: string | null;
  selectedItemType?: ItemType | null;
  onItemSelect: (itemType: ItemType | null, itemId: string | null) => void;
  pageNumbering?: PageNumberingSettings | null;

  // Camera Zoom (effect 19) wiring
  expandedAnimation?: SpreadAnimation | null;
  expandedAnimationIndex?: number | null;
  allAnimations?: SpreadAnimation[];
  onCameraZoomGeometryChange?: (animationIndex: number, geometry: ZoomAreaGeometry) => void;
  drawZoomAreaMode?: boolean;
  onDrawZoomAreaComplete?: (geometry: ZoomAreaGeometry) => void;
  onDrawZoomAreaCancel?: () => void;
  // Lines (effect 16) wiring
  onMotionLineGeometryChange?: (animationIndex: number, geometry: MotionLineGeometry) => void;
}

function resolveZoomLabel(
  animation: SpreadAnimation,
  allAnimations: SpreadAnimation[],
): string {
  const zoomList = allAnimations.filter(
    (a) => a.effect.type === 19 && a.target.type === 'spread',
  );
  const idx = zoomList.findIndex(
    (a) => a.order === animation.order,
  );
  if (idx < 0) return 'Camera Zoom #?';
  return `Camera Zoom #${idx + 1}`;
}

function resolveMotionLineLabel(
  animation: SpreadAnimation,
  allAnimations: SpreadAnimation[],
): string {
  const linesList = allAnimations.filter((a) => a.effect.type === 16);
  const idx = linesList.findIndex((a) => a.order === animation.order);
  if (idx < 0) return 'Motion Line #?';
  return `Motion Line #${idx + 1}`;
}

export function AnimationEditorCanvas({
  spread,
  zoomLevel,
  selectedItemId: externalItemId,
  selectedItemType: externalItemType,
  onItemSelect,
  pageNumbering,
  expandedAnimation,
  expandedAnimationIndex,
  allAnimations,
  onCameraZoomGeometryChange,
  drawZoomAreaMode,
  onDrawZoomAreaComplete,
  onDrawZoomAreaCancel,
  onMotionLineGeometryChange,
}: AnimationEditorCanvasProps) {
  const editorLangCode = useLanguageCode();
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ItemType | null>(
    null
  );
  const [selectedGeometry, setSelectedGeometry] = useState<Geometry | null>(
    null
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useZoomCenterScroll(zoomLevel, canvasRef);

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(
    canvasWidth,
    canvasHeight,
    zoomLevel
  );

  // Composite membership lookup — variant id → 1-based composite ordinal.
  // Drives the numeric badge so users can see which canvas items belong to the
  // same group at a glance. Click on badge selects the composite as a target.
  const compositeNumberByVariantId = useMemo(
    () => buildCompositeNumberMap(spread.composites ?? []),
    [spread.composites]
  );
  const handleSelectComposite = useCallback(
    (variantId: string) => {
      const compositeId = findCompositeIdForVariant(spread.composites ?? [], variantId);
      if (!compositeId) {
        log.warn("handleSelectComposite", "no composite for variant", { variantId });
        return;
      }
      onItemSelect("composite", compositeId);
    },
    [spread.composites, onItemSelect]
  );

  // Reset selection when spread changes
  useEffect(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setSelectedGeometry(null);
    onItemSelect(null, null);
    if (drawZoomAreaMode && onDrawZoomAreaCancel) {
      log.info("useEffect[spread.id]", "cancel drawZoomAreaMode on spread switch", {});
      onDrawZoomAreaCancel();
    }
  }, [spread.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from external selection (sidebar click → canvas highlight)
  useEffect(() => {
    if (externalItemId === undefined || externalItemType === undefined) return;
    if (
      externalItemId === selectedItemId &&
      externalItemType === selectedItemType
    )
      return;

    if (!externalItemId || !externalItemType) {
      setSelectedItemId(null);
      setSelectedItemType(null);
      setSelectedGeometry(null);
      return;
    }

    setSelectedItemId(externalItemId);
    setSelectedItemType(externalItemType);

    // Resolve geometry for selection overlay
    let geometry: Geometry | null = null;
    if (externalItemType === "image") {
      geometry =
        spread.images?.find((i) => i.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === "textbox") {
      const tb = spread.textboxes?.find((t) => t.id === externalItemId);
      if (tb) {
        const tbResult = getTextboxContentForLanguage(tb, editorLangCode);
        geometry = tbResult?.content?.geometry ?? null;
      }
    } else if (externalItemType === "shape") {
      geometry =
        spread.shapes?.find((s) => s.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === "video") {
      geometry =
        spread.videos?.find((v) => v.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === "auto_pic") {
      geometry =
        spread.auto_pics?.find((p) => p.id === externalItemId)?.geometry ?? null;
    } else if (externalItemType === "audio" || externalItemType === "quiz") {
      // Audio/quiz use fixed-size icons — selection handled by the component itself
      geometry = null;
    }
    setSelectedGeometry(geometry);
  }, [externalItemId, externalItemType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect handler
  const handleDeselect = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
    setSelectedGeometry(null);
    onItemSelect(null, null);
  }, [onItemSelect]);

  // Click outside handler
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!canvasRef.current?.contains(target)) {
        // Click outside canvas — skip deselect for known UI panels
        if (target.closest("[data-toolbar]")) return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
        if (target.closest('[role="navigation"]')) return; // animation editor sidebar
        handleDeselect();
      }
    },
    [handleDeselect]
  );

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDeselect();
      }
    },
    [handleDeselect]
  );

  // Setup global listeners
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // Canvas click handler (deselect when clicking empty area)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        handleDeselect();
      }
    },
    [handleDeselect]
  );

  // Image selection handler
  const handleImageSelect = useCallback(
    (imageId: string) => {
      if (drawZoomAreaMode) {
        log.debug("handleImageSelect", "skip: drawZoomAreaMode active", {});
        return;
      }
      log.info("handleImageSelect", "image selected", { imageId });
      const image = spread.images?.find((img) => img.id === imageId);
      if (!image) return;

      setSelectedItemId(imageId);
      setSelectedItemType("image");
      setSelectedGeometry(image.geometry);
      onItemSelect("image", imageId);
    },
    [spread.images, onItemSelect, drawZoomAreaMode]
  );

  // Textbox selection handler
  const handleTextboxSelect = useCallback(
    (textboxId: string) => {
      if (drawZoomAreaMode) return;
      const textbox = spread.textboxes?.find((tb) => tb.id === textboxId);
      if (!textbox) return;

      const tbResult = getTextboxContentForLanguage(textbox, editorLangCode);
      if (!tbResult?.content?.geometry) return;

      setSelectedItemId(textboxId);
      setSelectedItemType("textbox");
      setSelectedGeometry(tbResult.content.geometry);
      onItemSelect("textbox", textboxId);
    },
    [spread.textboxes, editorLangCode, onItemSelect, drawZoomAreaMode]
  );

  // Shape selection handler
  const handleShapeSelect = useCallback(
    (shapeId: string) => {
      if (drawZoomAreaMode) return;
      const shape = spread.shapes?.find((s) => s.id === shapeId);
      if (!shape) return;
      setSelectedItemId(shapeId);
      setSelectedItemType("shape");
      setSelectedGeometry(shape.geometry);
      onItemSelect("shape", shapeId);
    },
    [spread.shapes, onItemSelect, drawZoomAreaMode]
  );

  // Video selection handler
  const handleVideoSelect = useCallback(
    (videoId: string) => {
      if (drawZoomAreaMode) return;
      const video = spread.videos?.find((v) => v.id === videoId);
      if (!video) return;
      setSelectedItemId(videoId);
      setSelectedItemType("video");
      setSelectedGeometry(video.geometry);
      onItemSelect("video", videoId);
    },
    [spread.videos, onItemSelect, drawZoomAreaMode]
  );

  // Animated pic selection handler
  const handleAutoPicSelect = useCallback(
    (autoPicId: string) => {
      if (drawZoomAreaMode) return;
      log.info("handleAutoPicSelect", "auto_pic selected", { autoPicId });
      const autoPic = spread.auto_pics?.find((p) => p.id === autoPicId);
      if (!autoPic) return;
      setSelectedItemId(autoPicId);
      setSelectedItemType("auto_pic");
      setSelectedGeometry(autoPic.geometry);
      onItemSelect("auto_pic", autoPicId);
    },
    [spread.auto_pics, onItemSelect, drawZoomAreaMode]
  );

  // Audio selection handler (no SelectionOverlay — component handles its own selection border)
  const handleAudioSelect = useCallback(
    (audioId: string) => {
      if (drawZoomAreaMode) return;
      setSelectedItemId(audioId);
      setSelectedItemType("audio");
      setSelectedGeometry(null);
      onItemSelect("audio", audioId);
    },
    [onItemSelect, drawZoomAreaMode]
  );

  // Quiz selection handler (no SelectionOverlay — component handles its own selection border)
  const handleQuizSelect = useCallback(
    (quizId: string) => {
      if (drawZoomAreaMode) return;
      setSelectedItemId(quizId);
      setSelectedItemType("quiz");
      setSelectedGeometry(null);
      onItemSelect("quiz", quizId);
    },
    [onItemSelect, drawZoomAreaMode]
  );

  // Memoized textboxes with resolved language — skip player_visible=false (not renderable as target)
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes
      .filter(isItemPlayerVisible)
      .map((textbox) => {
        const result = getTextboxContentForLanguage(textbox, editorLangCode);
        if (!result?.content?.geometry) return null;
        return { textbox, langKey: result.langKey, data: result.content };
      })
      .filter(Boolean);
  }, [spread.textboxes, editorLangCode]);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex overflow-auto p-4 bg-muted/30"
    >
      {/* Canvas container - sized like spread-editor-panel */}
      <div
        ref={canvasRef}
        className="relative shrink-0 m-auto bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
        }}
        onClick={handleCanvasClick}
        tabIndex={0}
      >
        {/* Page Backgrounds using PageItem */}
        {spread.pages.map((page, pageIndex) => (
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
            onUpdatePage={() => {}} // Read-only in animation editor
            availableLayouts={[]}
            // No renderPageToolbar = not selectable
          />
        ))}

        {/* Page Divider — always visible */}
        <div
          className="absolute top-0 bottom-0 w-px bg-gray-300"
          style={{ left: "50%", zIndex: Z_INDEX.PAGE_BACKGROUND }}
        />

        {/* Page Number Overlay */}
        {pageNumbering && pageNumbering.position !== "none" && (
          <PageNumberingOverlay
            pages={spread.pages}
            position={pageNumbering.position}
            color={pageNumbering.color}
            fontFamily={pageNumbering.font_family}
            fontSize={pageNumbering.font_size}
          />
        )}

        {/* Images (selectable) — skip player_visible=false */}
        {spread.images?.filter(isItemPlayerVisible).map((image, index) => {
          const compositeNumber = compositeNumberByVariantId.get(image.id);
          return (
            <Fragment key={image.id}>
              <EditableImage
                image={image}
                index={index}
                zIndex={image["z-index"]}
                isSelected={
                  selectedItemId === image.id && selectedItemType === "image"
                }
                isEditable={true}
                showItemBorder={true}
                onSelect={() => handleImageSelect(image.id)}
              />
              {compositeNumber !== undefined && (
                <CompositeMemberBadge
                  compositeNumber={compositeNumber}
                  geometry={image.geometry}
                  zIndex={image["z-index"]}
                  onClick={() => handleSelectComposite(image.id)}
                />
              )}
            </Fragment>
          );
        })}

        {/* Shapes (selectable) — skip player_visible=false */}
        {spread.shapes?.filter(isItemPlayerVisible).map((shape, index) => (
          <EditableShape
            key={shape.id}
            shape={shape}
            index={index}
            zIndex={shape["z-index"]}
            isSelected={
              selectedItemId === shape.id && selectedItemType === "shape"
            }
            isEditable={true}
            onSelect={() => handleShapeSelect(shape.id)}
          />
        ))}

        {/* Videos (selectable) — skip player_visible=false */}
        {spread.videos?.filter(isItemPlayerVisible).map((video, index) => (
          <EditableVideo
            key={video.id}
            video={video}
            index={index}
            zIndex={video["z-index"]}
            isSelected={
              selectedItemId === video.id && selectedItemType === "video"
            }
            isEditable={true}
            showItemBorder={true}
            onSelect={() => handleVideoSelect(video.id)}
          />
        ))}

        {/* Auto Pics (selectable, showItemBorder for animation target visibility) — skip player_visible=false */}
        {spread.auto_pics?.filter(isItemPlayerVisible).map((autoPic, index) => {
          const compositeNumber = compositeNumberByVariantId.get(autoPic.id);
          return (
            <Fragment key={autoPic.id}>
              <EditableAutoPic
                autoPic={autoPic}
                index={index}
                zIndex={autoPic["z-index"]}
                isSelected={selectedItemId === autoPic.id && selectedItemType === "auto_pic"}
                isEditable={true}
                showItemBorder={true}
                onSelect={() => handleAutoPicSelect(autoPic.id)}
              />
              {compositeNumber !== undefined && (
                <CompositeMemberBadge
                  compositeNumber={compositeNumber}
                  geometry={autoPic.geometry}
                  zIndex={autoPic["z-index"]}
                  onClick={() => handleSelectComposite(autoPic.id)}
                />
              )}
            </Fragment>
          );
        })}

        {/* Audios (selectable) */}
        {spread.audios?.map((audio, index) => (
          <EditableAudio
            key={audio.id}
            audio={audio}
            index={index}
            zIndex={audio["z-index"]}
            isSelected={
              selectedItemId === audio.id && selectedItemType === "audio"
            }
            isEditable={true}
            onSelect={() => handleAudioSelect(audio.id)}
          />
        ))}

        {/* Auto Audios (Phase 1: NOT selectable, render-only Music icon) */}
        {(spread.auto_audios ?? [])
          .filter((a) => a.editor_visible !== false)
          .map((autoAudio, index) => (
            <EditableAutoAudio
              key={autoAudio.id}
              autoAudio={autoAudio}
              index={index}
              zIndex={autoAudio["z-index"]}
              isSelected={false}
              isEditable={true}
              onSelect={() => {}}
            />
          ))}

        {/* Quizzes (selectable) */}
        {spread.quizzes?.map((quiz, index) => (
          <EditableQuiz
            key={quiz.id}
            quiz={quiz}
            index={index}
            zIndex={quiz["z-index"]}
            isSelected={
              selectedItemId === quiz.id && selectedItemType === "quiz"
            }
            isEditable={true}
            onSelect={() => handleQuizSelect(quiz.id)}
          />
        ))}

        {/* Textboxes (selectable, not editable) */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          return (
            <EditableTextbox
              key={textbox.id}
              textboxContent={data}
              index={index}
              zIndex={textbox["z-index"] ?? LAYER_CONFIG.TEXT.min + index}
              isSelected={
                selectedItemId === textbox.id && selectedItemType === "textbox"
              }
              isSelectable={true}
              isEditable={false}
              showItemBorder={true}
              onSelect={() => handleTextboxSelect(textbox.id)}
              onTextChange={() => {}}
              onEditingChange={() => {}}
            />
          );
        })}

        {/* Selection overlay */}
        {selectedGeometry && <SelectionOverlay geometry={selectedGeometry} />}

        {/* Camera Zoom area overlay — render only when expanded animation is type 19 with target.type='spread' */}
        {expandedAnimation?.effect.type === 19 &&
          expandedAnimation.target.type === "spread" &&
          expandedAnimation.effect.geometry &&
          expandedAnimationIndex !== null &&
          expandedAnimationIndex !== undefined && (
            <ZoomAreaOverlay
              geometry={expandedAnimation.effect.geometry as ZoomAreaGeometry}
              spreadWidthPx={scaledWidth}
              spreadHeightPx={scaledHeight}
              spreadRatio={canvasHeight > 0 ? canvasWidth / canvasHeight : 1}
              label={resolveZoomLabel(expandedAnimation, allAnimations ?? [])}
              isSelected={true}
              onChange={(next) => onCameraZoomGeometryChange?.(expandedAnimationIndex, next)}
              onCommit={(final) => onCameraZoomGeometryChange?.(expandedAnimationIndex, final)}
              onSelect={() => {}}
            />
          )}

        {/* Motion Line overlay — render when expanded animation is type 16 (Lines) */}
        {expandedAnimation?.effect.type === 16 &&
          expandedAnimation.effect.geometry &&
          expandedAnimationIndex !== null &&
          expandedAnimationIndex !== undefined &&
          (() => {
            const itemGeometry = resolveTargetItemGeometry(
              expandedAnimation.target,
              spread,
            );
            if (!itemGeometry) {
              log.debug("render", "motion-line orphan target — skip overlay", {
                targetId: expandedAnimation.target.id,
                targetType: expandedAnimation.target.type,
              });
              return null;
            }
            const label = resolveMotionLineLabel(expandedAnimation, allAnimations ?? []);
            return (
              <MotionLineOverlay
                geometry={expandedAnimation.effect.geometry as MotionLineGeometry}
                itemGeometry={itemGeometry}
                spreadWidthPx={scaledWidth}
                spreadHeightPx={scaledHeight}
                label={label}
                isSelected={true}
                onChange={(next) => onMotionLineGeometryChange?.(expandedAnimationIndex, next)}
                onCommit={(final) => onMotionLineGeometryChange?.(expandedAnimationIndex, final)}
                onSelect={() => {}}
              />
            );
          })()}

        {/* Crosshair drawing surface — when drawZoomAreaMode active */}
        {drawZoomAreaMode && (
          <DrawZoomAreaSurface
            spreadWidthPx={scaledWidth}
            spreadHeightPx={scaledHeight}
            spreadRatio={canvasHeight > 0 ? canvasWidth / canvasHeight : 1}
            onComplete={(geometry) => {
              log.info("drawSurface.onComplete", "forward to parent", { w: geometry.w, h: geometry.h });
              onDrawZoomAreaComplete?.(geometry);
            }}
            onCancel={() => {
              log.info("drawSurface.onCancel", "forward cancel", {});
              onDrawZoomAreaCancel?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
