// spread-turn-snapshot.ts - Deep-clone the live spread DOM into detached node(s)
// so the overlay can render the "outgoing" page during a turn. Strips elements
// that would re-trigger media playback or execute scripts when re-mounted
// (spec §4.1). For `spread` layout, two independent clones are produced because
// a single Node cannot have two parents (Static + FlippingCard need their own).

import { createLogger } from '@/utils/logger';
import type { TurnDirection, TurnLayout, TurnSnapshot } from './spread-turn-types';

const log = createLogger('Editor', 'SpreadTurnSnapshot');

/** Tags whose deep clones would reload media or run scripts. Removed from the clone. */
const STRIP_SELECTOR = 'audio, video, script, canvas';

/** Inline event-handler attributes — defensive cleanup so that any stale bindings
 *  on the cloned tree cannot fire from the overlay. Extend as needed. */
const STRIP_ATTRS = ['onclick', 'onmouseenter', 'onmouseleave', 'onload', 'onerror'];

/** Deep-clone the container and strip media + inline event handlers.
 *  Also resets the root clone's transform/transition: in fullPageMode the live
 *  container has `translateX(panOffsetX)` baked inline (to pan visible page
 *  inside the wrapper), but the overlay positions us at the post-transform
 *  rect already and wants the clone to fill its box without any further pan —
 *  otherwise the clone's content lands outside the overlay's visible region. */
function deepCloneAndStrip(container: HTMLElement): HTMLElement {
  const clone = container.cloneNode(true) as HTMLElement;

  const strippable = clone.querySelectorAll(STRIP_SELECTOR);
  strippable.forEach((el) => el.remove());

  const allElements = clone.querySelectorAll<HTMLElement>('*');
  allElements.forEach((el) => {
    STRIP_ATTRS.forEach((attr) => {
      if (el.hasAttribute(attr)) el.removeAttribute(attr);
    });
  });

  clone.style.transform = 'none';
  clone.style.transition = 'none';
  // Drop the live container's `shadow-lg` — during 3D rotation the box-shadow
  // rotates with the box and projects as a transient bottom band at non-zero
  // tilt angles. The live spread underneath still owns the resting shadow.
  clone.style.boxShadow = 'none';

  return clone;
}

/**
 * Clone the spread container into off-DOM nodes ready to be appended into the
 * overlay's layers. Returns `null` if the container is missing — caller should
 * bypass the transition in that case.
 *
 * Always returns 2 independent clones (StaticLayer + FlippingCard each need
 * their own — a Node cannot have two parents). Layout-uniform behavior.
 */
export function takeSnapshot(
  container: HTMLElement | null,
  direction: TurnDirection,
  layout: TurnLayout,
): TurnSnapshot | null {
  if (!container) {
    log.warn('takeSnapshot', 'no container provided — cannot snapshot', { direction, layout });
    return null;
  }

  const flippingNode = deepCloneAndStrip(container);
  const staticNode = deepCloneAndStrip(container);

  const dimensions = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  log.debug('takeSnapshot', 'snapshot ready', {
    direction,
    layout,
    width: dimensions.width,
    height: dimensions.height,
  });

  return {
    staticNode,
    flippingNode,
    dimensions,
    direction,
    layout,
  };
}
