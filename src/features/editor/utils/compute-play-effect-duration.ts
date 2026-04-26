import { createLogger } from "@/utils/logger";

const log = createLogger("Util", "ComputePlayEffectDuration");

export interface ComputePlayEffectDurationInput {
  loop?: number;
  media_length?: number;
}

/**
 * Sync rule for PLAY animation effect.duration on audio targets.
 *
 *  loop > 0     → media_length × loop
 *  loop === -1  → 0          (infinite, no timeline cap)
 *  loop === 0   → media_length (1 play)
 *  loop absent  → media_length (1 play)
 *  media_length absent/0 → undefined (caller keeps existing duration)
 */
export function computePlayEffectDuration(
  input: ComputePlayEffectDurationInput,
): number | undefined {
  const { loop, media_length } = input;
  if (!media_length || media_length <= 0) {
    log.debug("compute", "media_length absent", { loop });
    return undefined;
  }
  if (loop === -1) {
    log.debug("compute", "infinite loop → 0", { media_length });
    return 0;
  }
  if (typeof loop === "number" && loop > 0) {
    return media_length * loop;
  }
  return media_length;
}
