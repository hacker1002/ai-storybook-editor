// remotion/lottie/thorvg-frame-mapping.ts
// Pure Remotion-frame → dotLottie-frame mapping for the ThorVG render adapter. Split out so
// it's unit-testable in isolation (and to keep the .tsx a component-only module for HMR).

/**
 * Replays the editor runtime's looped, real-time .lottie playback deterministically:
 *   timeSec     = (remotionFrame / videoFps) * speed
 *   lottieFrame = (timeSec * nativeFps) mod totalFrames
 *
 * Fractional result is intentional — frame interpolation is ON, so a fractional seek is a
 * pure function of the frame (still deterministic). The modulo reproduces the auto-pic's
 * infinite loop. Returns 0 for not-yet-loaded / degenerate inputs (nativeFps or
 * totalFrames ≤ 0) so a pre-load frame is a no-op seek rather than NaN.
 */
export function mapFrameToLottie(
  remotionFrame: number,
  videoFps: number,
  nativeFps: number,
  totalFrames: number,
  speed = 1,
): number {
  if (totalFrames <= 0 || nativeFps <= 0 || videoFps <= 0) return 0;
  const timeSec = (remotionFrame / videoFps) * speed;
  const raw = timeSec * nativeFps;
  const mod = raw % totalFrames;
  return mod < 0 ? mod + totalFrames : mod;
}
