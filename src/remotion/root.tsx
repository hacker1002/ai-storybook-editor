// remotion/root.tsx
// Registered composition tree consumed by the worker's bundle()/selectComposition().
// Wraps the existing SpreadVideoComposition AND the full-book BookVideoComposition
// (DO NOT reimplement) and derives durationInFrames from the shared metadata
// helpers via calculateMetadata — so duration follows the actual inputProps at
// render time, not a hardcoded constant.

import { Composition } from "remotion";
import {
  SpreadVideoComposition,
  type SpreadVideoCompositionProps,
} from "./spread-video-composition";
import {
  BookVideoComposition,
  type BookVideoInputProps,
} from "./book-video-composition";
import { createCombinedDemoSpread } from "@/features/demo-spread-views/__mocks__/combined-demo-spread-fixture";
import { createBookDemoSpreads } from "@/features/demo-spread-views/__mocks__/book-demo-fixture";
import { resolveBookSequence } from "@/features/editor/components/playable-spread-view/resolve-book-sequence";
import {
  SPREAD_COMPOSITION_ID,
  BOOK_COMPOSITION_ID,
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  RESOLUTION_DIMS,
  getSpreadDurationInFrames,
  getBookDurationInFrames,
} from "./composition-metadata";

// Studio/preview-only default props. The worker overrides these with real inputProps
// from the HTTP request; these fixtures just let Remotion Studio open the compositions.
const spreadDefaultProps: SpreadVideoCompositionProps = {
  spread: createCombinedDemoSpread(),
  language: "en_US",
};

const bookDefaultProps: BookVideoInputProps = {
  spreads: createBookDemoSpreads(),
  sections: [],
  edition: "classic",
  language: "en_US",
  resolution: "qhd",
};

const QHD = RESOLUTION_DIMS.qhd;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id={SPREAD_COMPOSITION_ID}
        component={SpreadVideoComposition}
        durationInFrames={1}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={spreadDefaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: getSpreadDurationInFrames(props.spread, VIDEO_FPS),
        })}
      />

      <Composition
        id={BOOK_COMPOSITION_ID}
        component={BookVideoComposition}
        durationInFrames={1}
        fps={VIDEO_FPS}
        width={QHD.width}
        height={QHD.height}
        defaultProps={bookDefaultProps}
        calculateMetadata={({ props }) => {
          const sequence = resolveBookSequence(props.spreads, props.sections, {
            startSpreadId: props.startSpreadId,
            edition: props.edition,
          });
          const dims = RESOLUTION_DIMS[props.resolution] ?? QHD;
          return {
            durationInFrames: getBookDurationInFrames(sequence, VIDEO_FPS),
            width: dims.width,
            height: dims.height,
          };
        }}
      />
    </>
  );
}
