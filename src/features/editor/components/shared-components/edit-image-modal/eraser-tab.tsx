// eraser-tab.tsx — Erasor tab (design 02-eraser-tab.md): client-side brush editing (Erase →
// transparent / Paint → color) on a single workspace canvas. The hook owns brush/color/stroke
// state; it returns a Handle (ParamsPanel + CanvasLayer + commit + history) the shell consumes.
// Stroke engine is reused verbatim (erase-stroke-engine). commit exports at natural resolution
// + uploads → a permanent URL; the shell prepends it as a new `type='edited'` version.
// canvasMode='paint' override (shell renders CanvasLayer in the center stage).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Undo2, Redo2, RotateCcw } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { uploadImageToStorage } from '@/apis/storage-api';
import type { Illustration } from '@/types/prop-types';
import {
  type Stroke,
  type StrokeMode,
  norm,
  paintStrokesOnCtx,
} from './erase-stroke-engine';
import {
  BRUSH,
  DEFAULT_ERASER_COLOR,
  RESET_CONFIRM_THRESHOLD,
  SWAP_MODAL_OUTLINE_BUTTON_CLASS,
  Z_INDEX,
} from './edit-image-modal-constants';
import { computeFrameSize, fitNaturalToFrame } from './edit-image-modal-fit';

const log = createLogger('Editor', 'EraserTab');

const SECTION_LABEL_CLASS =
  'mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';

export interface EraserTabApi {
  ParamsPanel: ReactNode;
  CanvasLayer: ReactNode;
  /** strokes.length > 0 — the [+] commit gate. */
  canCommit: boolean;
  /** strokes.length > 0 — shell blocking-confirm gate on version/tool change (semantic alias). */
  hasUncommitted: boolean;
  /** Export the workspace at natural resolution + upload → new permanent URL. Throws on CORS taint. */
  commit: (version: Illustration) => Promise<string>;
  /** Clear strokes + redo after a successful commit (shell calls). */
  afterCommit: () => void;
  /** Discard strokes when the source image changes (version/tool switch, post-confirm). */
  resetStrokes: () => void;
  undo: () => void;
  redo: () => void;
}

interface UseEraserTabOptions {
  selectedVersion: Illustration | null;
  pathPrefix: string;
  /** Shell zoom (50–400). Drives canvas display CSS size + brush-ring cursor scale so the
   *  visual matches the codebase's CSS-resize zoom convention (NOT transform:scale, so the
   *  scroll container's metrics stay accurate when the user zooms past the viewport). */
  zoom: number;
}

export function useEraserTabState({ selectedVersion, pathPrefix, zoom }: UseEraserTabOptions): EraserTabApi {
  const [brushSize, setBrushSize] = useState<number>(BRUSH.default);
  const [colorMode, setColorMode] = useState(false); // false = Erase (default), true = Paint
  const [color, setColor] = useState(DEFAULT_ERASER_COLOR);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  // Canvas intrinsic size (display px @ zoom 100%); bumped on image load to re-trigger draw.
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const sourceImgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mirror of activeStroke — read in event handlers without stale closures, and to commit
  // strokes outside a React updater (nested setState double-invokes under StrictMode).
  const activeStrokeRef = useRef<Stroke | null>(null);

  const eraserMode: StrokeMode = colorMode ? 'paint' : 'erase';
  const canCommit = strokes.length > 0;

  // ── Image load → size canvas to fit, trigger redraw (event handler — no set-state-in-effect) ──
  const handleImageLoad = useCallback(() => {
    const img = sourceImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || img.naturalWidth === 0) return;
    // Shared fit logic (edit-image-modal-fit) — never upscales beyond natural so the canvas
    // display size matches preview/compare modes exactly (user-reported mode-switch jump).
    const frame = computeFrameSize(window.innerWidth, window.innerHeight);
    const { w, h } = fitNaturalToFrame(img.naturalWidth, img.naturalHeight, frame);
    canvas.width = w;
    canvas.height = h;
    setCanvasSize({ w, h });
    log.info('handleImageLoad', 'canvas sized', {
      displayW: w,
      displayH: h,
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
    });
  }, []);

  // Callback ref: assign the node AND close the cached-image gap. A cached image can finish
  // loading before React attaches `onLoad` (or mount already `complete`), so `onLoad` never fires
  // and `canvasSize` stays null → the canvas never sizes/draws and strokes commit to state but
  // paint nothing. When the node is already decoded on attach, run the load path once. Deferred to
  // a microtask so canvasRef (attached AFTER this <img> in JSX order on first mount) is ready.
  const attachSourceImg = useCallback(
    (node: HTMLImageElement | null) => {
      sourceImgRef.current = node;
      if (node && node.complete && node.naturalWidth > 0) queueMicrotask(handleImageLoad);
    },
    [handleImageLoad],
  );

  // ── Workspace render: draw image then composite strokes (no setState — canvas side effect) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = sourceImgRef.current;
    if (!canvas || !img || !canvasSize || img.naturalWidth === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    paintStrokesOnCtx(ctx, strokes, activeStroke, canvas.width, canvas.height, 1, false);
  }, [strokes, activeStroke, canvasSize]);

  // ── Pointer handlers (intrinsic-px mapping via rect → zoom-invariant, ⚡H) ──────────────
  const pointToIntrinsic = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect(); // includes the shell's CSS scale
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = pointToIntrinsic(e, canvas);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const stroke: Stroke = {
        points: [norm(x, y, canvas.width, canvas.height)],
        size: brushSize,
        mode: eraserMode,
        color,
      };
      activeStrokeRef.current = stroke;
      setActiveStroke(stroke);
    },
    [brushSize, eraserMode, color],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = pointToIntrinsic(e, canvas);
    setCursorPos({ x, y }); // intrinsic px → brush ring scales with the shell transform
    const current = activeStrokeRef.current;
    if (!current) return;
    const updated: Stroke = {
      ...current,
      points: [...current.points, norm(x, y, canvas.width, canvas.height)],
    };
    activeStrokeRef.current = updated;
    setActiveStroke(updated);
  }, []);

  const handlePointerUp = useCallback(() => {
    const committed = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setActiveStroke(null);
    if (!committed || committed.points.length === 0) return;
    setStrokes((s) => [...s, committed]);
    setRedoStack([]); // a fresh stroke starts a new history branch
    log.debug('handlePointerUp', 'stroke committed', {
      points: committed.points.length,
      mode: committed.mode,
    });
  }, []);

  const handlePointerLeave = useCallback(() => setCursorPos(null), []);

  // ── History ────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      log.debug('undo', 'stroke popped', { remaining: prev.length - 1 });
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => [...s, last]);
      log.debug('redo', 'stroke restored', { remaining: prev.length - 1 });
      return prev.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
    setActiveStroke(null);
    activeStrokeRef.current = null;
  }, []);

  const handleReset = useCallback(() => {
    if (strokes.length >= RESET_CONFIRM_THRESHOLD) {
      setResetConfirmOpen(true);
      return;
    }
    log.debug('handleReset', 'cleared', { count: strokes.length });
    clearAll();
  }, [strokes.length, clearAll]);

  const resetStrokes = clearAll;
  const afterCommit = clearAll;

  // ── Commit: export natural-res + upload ──────────────────────────────────────
  const commit = useCallback(
    async (_version: Illustration): Promise<string> => {
      const img = sourceImgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas || strokes.length === 0) throw new Error('Nothing to save');
      if (img.naturalWidth === 0) throw new Error('Image not loaded');

      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      log.info('commit', 'export start', { strokeCount: strokes.length, naturalW, naturalH, pathPrefix });

      const offscreen = document.createElement('canvas');
      offscreen.width = naturalW;
      offscreen.height = naturalH;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) throw new Error('Could not get 2D context');

      offCtx.drawImage(img, 0, 0, naturalW, naturalH);
      // Display→natural scale (aspect preserved when sizing canvas → axes equal; average is defensive).
      const brushScale = (naturalW / canvas.width + naturalH / canvas.height) / 2;
      paintStrokesOnCtx(offCtx, strokes, null, naturalW, naturalH, brushScale, false);

      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => {
          if (!b) reject(new Error('Canvas export failed — canvas may be tainted by CORS'));
          else resolve(b);
        }, 'image/png');
      });

      const file = new File([blob], `erased-${Date.now()}.png`, { type: 'image/png' });
      const result = await uploadImageToStorage(file, pathPrefix);
      log.info('commit', 'upload complete', { publicUrl: result.publicUrl.slice(0, 60) });
      return result.publicUrl;
    },
    [strokes, pathPrefix],
  );

  // ── ParamsPanel ──────────────────────────────────────────────────────────────
  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <>
        <div className="flex flex-col gap-5 px-4 py-4">
          <section>
            <p className={SECTION_LABEL_CLASS}>
              <span>Brush Size</span>
              <span className="normal-case tabular-nums text-[var(--swap-modal-text-secondary)]">
                {brushSize}px
              </span>
            </p>
            <Slider
              value={[brushSize]}
              min={BRUSH.min}
              max={BRUSH.max}
              step={BRUSH.step}
              onValueChange={(v) => setBrushSize(v[0] ?? BRUSH.default)}
              aria-label="Brush size"
            />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
                Color Mode
              </span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={colorMode}
                  onCheckedChange={(v) => {
                    setColorMode(v);
                    log.debug('ParamsPanel', 'color mode toggle', { paint: v });
                  }}
                  aria-label="Color mode (off = erase, on = paint)"
                />
                <span className="text-xs text-[var(--swap-modal-text-secondary)]">
                  {colorMode ? 'Paint' : 'Erase'}
                </span>
              </div>
            </div>
            <label
              className={`flex items-center gap-1.5 rounded-md border border-[var(--swap-modal-border-strong)] px-2 py-1.5 ${
                colorMode ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
              }`}
              title={colorMode ? 'Pick paint color' : 'Turn on Color Mode to paint'}
            >
              <span
                className="h-4 w-4 rounded-sm border border-[var(--swap-modal-border-strong)]"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-xs text-[var(--swap-modal-text-primary)]">{color}</span>
              <input
                type="color"
                value={color}
                disabled={!colorMode}
                onChange={(e) => setColor(e.target.value)}
                className="sr-only"
                aria-label="Paint color"
              />
            </label>
          </section>

          <section>
            <p className={SECTION_LABEL_CLASS}>History</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className={`flex-1 gap-1.5 ${SWAP_MODAL_OUTLINE_BUTTON_CLASS}`}
                onClick={undo}
                disabled={strokes.length === 0}
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`flex-1 gap-1.5 ${SWAP_MODAL_OUTLINE_BUTTON_CLASS}`}
                onClick={redo}
                disabled={redoStack.length === 0}
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
                Redo
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 gap-1.5"
                onClick={handleReset}
                disabled={strokes.length === 0}
                aria-label="Reset strokes"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </section>
        </div>

        <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <AlertDialogContent style={{ zIndex: Z_INDEX.confirmDialog }}>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all strokes?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes all {strokes.length} strokes from the canvas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep strokes</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  log.debug('handleReset', 'confirmed', { count: strokes.length });
                  clearAll();
                  setResetConfirmOpen(false);
                }}
              >
                Clear all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    ),
    [brushSize, colorMode, color, strokes.length, redoStack.length, resetConfirmOpen, undo, redo, handleReset, clearAll],
  );

  // ── CanvasLayer (rendered in the shell stage when canvasMode='paint') ─────────
  // Codebase zoom convention (see generate-image-modal): apply zoom as CSS width/height on
  // the canvas display (NOT transform:scale), so the modal's scroll container can reach
  // every part of the zoomed content. Cursor coords/diameter are stored in intrinsic
  // canvas-px; multiply by scaleFactor for visual placement on the now-stretched canvas.
  const cursorDiameter = brushSize * 2; // intrinsic px
  const scaleFactor = zoom / 100;
  const displayW = canvasSize ? Math.round(canvasSize.w * scaleFactor) : undefined;
  const displayH = canvasSize ? Math.round(canvasSize.h * scaleFactor) : undefined;
  const CanvasLayer = useMemo<ReactNode>(
    () => (
      <div
        className="relative leading-[0]"
        style={displayW && displayH ? { width: displayW, height: displayH } : undefined}
      >
        {/* Hidden source — drawImage origin for the workspace canvas. crossorigin so toBlob
            isn't CORS-tainted. Keyed by url so a version swap reliably re-fires onLoad. */}
        <img
          key={selectedVersion?.media_url ?? 'none'}
          ref={attachSourceImg}
          src={selectedVersion?.media_url}
          alt=""
          crossOrigin="anonymous"
          className="hidden"
          onLoad={handleImageLoad}
        />
        <canvas
          ref={canvasRef}
          className="block cursor-none"
          style={{ width: '100%', height: '100%' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
        {cursorPos && (
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              width: cursorDiameter * scaleFactor,
              height: cursorDiameter * scaleFactor,
              left: (cursorPos.x - cursorDiameter / 2) * scaleFactor,
              top: (cursorPos.y - cursorDiameter / 2) * scaleFactor,
              backgroundColor: colorMode ? `${color}80` : 'transparent',
              boxShadow: '0 0 0 1px #fff, 0 0 0 2px #000',
            }}
          />
        )}
      </div>
    ),
    [
      selectedVersion?.media_url,
      cursorPos,
      cursorDiameter,
      scaleFactor,
      displayW,
      displayH,
      colorMode,
      color,
      attachSourceImg,
      handleImageLoad,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handlePointerLeave,
    ],
  );

  return {
    ParamsPanel,
    CanvasLayer,
    canCommit,
    hasUncommitted: canCommit,
    commit,
    afterCommit,
    resetStrokes,
    undo,
    redo,
  };
}
