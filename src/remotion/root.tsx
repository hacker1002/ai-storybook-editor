// remotion/root.tsx
// Registered composition tree consumed by the worker's bundle()/selectComposition().
// Wraps the existing SpreadVideoComposition (DO NOT reimplement) and derives a
// per-spread durationInFrames from the shared metadata helper via calculateMetadata —
// so duration follows the actual inputProps at render time, not a hardcoded constant.

import { Composition } from "remotion";
import {
  SpreadVideoComposition,
  type SpreadVideoCompositionProps,
} from "@/features/demo-spread-views/components/remotion-spike/spread-video-composition";
import { createCombinedDemoSpread } from "@/features/demo-spread-views/__mocks__/combined-demo-spread-fixture";
import {
  SPREAD_COMPOSITION_ID,
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  getSpreadDurationInFrames,
} from "./composition-metadata";

// Studio/preview-only default props. The worker overrides these with real inputProps
// from the HTTP request; this fixture just lets Remotion Studio open the composition.
const defaultProps: SpreadVideoCompositionProps = {
  spread: createCombinedDemoSpread(),
  language: "en_US",
};

export function RemotionRoot() {
  return (
    <Composition
      id={SPREAD_COMPOSITION_ID}
      component={SpreadVideoComposition}
      durationInFrames={1}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: getSpreadDurationInFrames(props.spread, VIDEO_FPS),
      })}
    />
  );
}
