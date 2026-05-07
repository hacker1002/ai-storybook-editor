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

/** Deep-clone the container and strip media + inline event handlers. */
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

  return clone;
}

/**
 * Clone the spread container into off-DOM node(s) ready to be appended into the
 * overlay's layers. Returns `null` if the container is missing — caller should
 * bypass the transition in that case.
 *
 * - `layout === 'spread'`: returns 2 independent clones (`staticNode` + `flippingNode`).
 * - otherwise: 1 clone (`flippingNode`); `staticNode` is `null`.
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
  const staticNode = layout === 'spread' ? deepCloneAndStrip(container) : null;

  const dimensions = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  log.debug('takeSnapshot', 'snapshot ready', {
    direction,
    layout,
    hasStatic: staticNode !== null,
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
