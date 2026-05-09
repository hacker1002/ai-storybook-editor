// restore-base-rotation.ts
// React applies the static geometry rotation via inline `transform: rotate(Xdeg)`.
// GSAP's `clearProps: 'transform'` wipes that inline style, and React doesn't
// re-render to restore it — items render axis-aligned in the player.
//
// Each editable item writes `data-rotation` on its outer wrapper. After any
// `clearProps` we re-establish the base rotation through GSAP so subsequent
// tweens compose correctly with it.

import { gsap } from 'gsap';

export function restoreBaseRotation(element: HTMLElement): void {
  const raw = element.dataset.rotation;
  if (!raw) return;
  const r = parseFloat(raw);
  if (!Number.isFinite(r) || r === 0) return;
  gsap.set(element, { rotation: r, transformOrigin: 'center center' });
}
