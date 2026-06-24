// outpaint-overlays.tsx — Presentational slot for the Outpaint tab (design 05-outpaint-tab.md
// §5.2), split out of outpaint-tab.tsx so that file can export the hook without tripping
// react-refresh/only-export-components. Pure geometry → CSS; the hook owns the params and mounts
// this via a render-prop closure. Compare uses the shared CompareSlider (no override) — see
// edit-image-modal-canvas.tsx.

import { OUTPAINT_FRAME_COLOR, OUTPAINT_FRAME_FILL, type ExpandDirection } from './edit-image-modal-constants';
import { outpaintFrameInset } from './edit-image-modal-utils';
import { type Size } from './edit-image-modal-fit';

// ── Preview overlay: dashed target frame (design §5.2) ─────────────────────────
// Renders inside the canvas's `relative` image wrapper (size = box). The frame grows OUTWARD on
// the selected edges (negative offsets) so the wrapper must NOT clip (canvas keeps overflow
// visible). Rounding happens here (render edge) so the pure helper stays float-exact.
export function OutpaintFrameOverlay({
  box,
  direction,
  ratio,
}: {
  box: Size;
  direction: ExpandDirection;
  ratio: number;
}) {
  const inset = outpaintFrameInset(box, direction, ratio);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: Math.round(inset.left),
        top: Math.round(inset.top),
        width: Math.round(inset.width),
        height: Math.round(inset.height),
        border: `2px dashed ${OUTPAINT_FRAME_COLOR}`,
        background: OUTPAINT_FRAME_FILL,
      }}
    >
      {ratio > 0 && (
        <span
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: OUTPAINT_FRAME_COLOR }}
        >
          Outpaint {Math.round(ratio)}%
        </span>
      )}
    </div>
  );
}
