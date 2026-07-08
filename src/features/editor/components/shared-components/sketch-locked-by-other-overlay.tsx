// sketch-locked-by-other-overlay.tsx — reusable grey-out veil for a sketch resource
// (page image OR textbox) held by ANOTHER editor. Renders a dim layer + a 🔒 holder-name
// badge. Advisory UX ONLY — the acquire 409 is the real authority (SRS §5). Used on two
// surfaces (page image cell + textbox), so it lives as one shared component (DRY).

'use client';

import { Lock } from 'lucide-react';
import type { Geometry } from '@/types/canvas-types';
import { FALLBACK_HOLDER_NAME } from '@/stores/resource-lock-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'LockedByOtherOverlay');

export interface LockedByOtherOverlayProps {
  /** Display name of the other holder; null → generic fallback ("another editor"). */
  holderName: string | null;
  /** Canvas-% placement (textbox). Omit to fill the positioned parent cell (inset-0, page image). */
  geometry?: Geometry;
  /** Stacking order within the canvas frame. */
  zIndex?: number;
  /** true → the veil captures the pointer + shows a not-allowed cursor (textbox: the veil owns
   *  the surface). false (default) → pointer-events:none so the parent cell keeps its own
   *  click/hover handling (page image, which toasts on click). */
  interactive?: boolean;
}

/** Dim + lock-badge overlay for a resource another editor is holding. */
export function LockedByOtherOverlay({
  holderName,
  geometry,
  zIndex,
  interactive = false,
}: LockedByOtherOverlayProps) {
  const name = holderName ?? FALLBACK_HOLDER_NAME;
  log.debug('render', 'locked-by-other veil', { hasGeometry: !!geometry, interactive });
  return (
    <div
      aria-hidden="true"
      title={`${name} is editing`}
      className={[
        'absolute flex items-center justify-center bg-background/60',
        interactive ? 'pointer-events-auto cursor-not-allowed' : 'pointer-events-none',
      ].join(' ')}
      style={
        geometry
          ? {
              left: `${geometry.x}%`,
              top: `${geometry.y}%`,
              width: `${geometry.w}%`,
              height: `${geometry.h}%`,
              zIndex,
            }
          : { inset: 0, zIndex }
      }
    >
      <span className="flex max-w-[92%] items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}

export default LockedByOtherOverlay;
