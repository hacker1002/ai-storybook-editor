// before-after-compare.tsx — Reusable BEFORE/AFTER image compare slider.
// Local UI state only (handle %), never touches the draft. Pointer drag +
// keyboard (←/→ = 5%). `after` is clipped from the left by the handle position.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/utils/utils';

interface Props {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
  /**
   * When true, the slider box is sized to the BEFORE image's contained fit
   * within the available area (measured), so it frames the image exactly like
   * a standalone <img> — no side/letterbox bands. Requires an ancestor with a
   * definite height (the area wrapper fills it). When false (default), the box
   * fills its parent and the caller sets the size via `className`.
   */
  matchImageAspect?: boolean;
}

interface Box {
  width: number;
  height: number;
}

function containFit(areaW: number, areaH: number, aspect: number): Box {
  let width = areaW;
  let height = areaW / aspect;
  if (height > areaH) {
    height = areaH;
    width = areaH * aspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

export function BeforeAfterCompare({
  beforeUrl,
  afterUrl,
  className,
  matchImageAspect = false,
}: Props) {
  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const beforeImgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Derive the contained box from the BEFORE image's natural aspect + the
  // available area. Reads the live <img>, so it works both on load and on
  // resize without storing aspect in state.
  const measure = useCallback(() => {
    if (!matchImageAspect) return;
    const area = areaRef.current;
    const img = beforeImgRef.current;
    if (!area || !img) return;
    const { clientWidth: aw, clientHeight: ah } = area;
    const { naturalWidth: iw, naturalHeight: ih } = img;
    if (aw === 0 || ah === 0 || iw === 0 || ih === 0) return;
    setBox(containFit(aw, ah, iw / ih));
  }, [matchImageAspect]);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(0, Math.min(100, next)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    updateFromClientX(e.clientX);
    const move = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPct((p) => Math.max(0, p - 5));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPct((p) => Math.min(100, p + 5));
    }
  };

  // Pre-paint measure: cached images report `complete` synchronously here, so
  // switching back to an already-viewed variant sizes correctly on the first
  // frame — no fallback flash. Resets box on URL change before recompute.
  useLayoutEffect(() => {
    if (!matchImageAspect) return;
    setBox(null);
    if (beforeImgRef.current?.complete) measure();
  }, [matchImageAspect, beforeUrl, measure]);

  // Recompute on area resize (window/modal resize).
  useEffect(() => {
    if (!matchImageAspect) return;
    const area = areaRef.current;
    if (!area) return;
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, [matchImageAspect, measure]);

  const inner = (
    <>
      <img
        ref={beforeImgRef}
        src={beforeUrl}
        alt="Before swap"
        draggable={false}
        onLoad={measure}
        className="block h-full w-full object-contain"
      />
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
      >
        <img
          src={afterUrl}
          alt="After swap"
          draggable={false}
          className="block h-full w-full object-contain"
        />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare before and after swap"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className="absolute bottom-0 top-0 -ml-0.5 w-1 cursor-ew-resize bg-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ left: `${pct}%` }}
      >
        <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/10" />
      </div>

      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        BEFORE
      </span>
      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        AFTER
      </span>
    </>
  );

  if (matchImageAspect) {
    // Area fills the (definite-height) parent; box hugs the contained image.
    return (
      <div
        ref={areaRef}
        className="flex h-full w-full items-center justify-center"
      >
        <div
          ref={containerRef}
          className={cn(
            'relative select-none overflow-hidden rounded-md bg-muted',
            className,
          )}
          style={
            box
              ? { width: box.width, height: box.height }
              : { width: '100%', height: '100%', visibility: 'hidden' }
          }
        >
          {inner}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full select-none overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      {inner}
    </div>
  );
}
