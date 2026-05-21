// before-after-compare.tsx — Reusable BEFORE/AFTER image compare slider.
// Local UI state only (handle %), never touches the draft. Pointer drag +
// keyboard (←/→ = 5%). `after` is clipped from the left by the handle position.

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/utils/utils';

interface Props {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function BeforeAfterCompare({ beforeUrl, afterUrl, className }: Props) {
  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-[360px] w-full select-none overflow-hidden rounded-md bg-muted',
        className,
      )}
    >
      <img
        src={beforeUrl}
        alt="Before swap"
        draggable={false}
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
    </div>
  );
}
