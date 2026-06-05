// __mocks__/book-demo-fixture.ts — multi-spread book fixture for the Remotion
// Studio `book-video` composition (phase 02). The single-spread `combined` fixture
// has a fixed id, so a book needs distinct spread ids to exercise the walker,
// segment chain, flips, and per-spread audio offsets. Three spreads → two flips.
//
// Studio/preview-only — the worker overrides defaultProps with real inputProps.

import type { PlayableSpread } from "@/types/playable-types";
import { createCombinedDemoSpread } from "./combined-demo-spread-fixture";

/** Clone the combined demo spread with a fresh id so the walker treats each as
 *  distinct (id is the only field the walker keys on). */
function cloneWithId(id: string): PlayableSpread {
  return { ...createCombinedDemoSpread(), id };
}

/** Three distinct spreads → linear walk (no sections) yields 2 flips. */
export function createBookDemoSpreads(): PlayableSpread[] {
  return [
    cloneWithId("book-demo-spread-0001"),
    cloneWithId("book-demo-spread-0002"),
    cloneWithId("book-demo-spread-0003"),
  ];
}
