// detect-plane-config.ts — The SINGLE parametrize point for the 3 swap-defect
// detect planes (design 05-15 §2). All Check/overlay logic is generic; only
// these per-plane values differ: scope key + enqueue endpoint + job-type/dedup
// family + the backend core reference. Mirrors the `STAGE_TAB_CONFIG` precedent
// (05-11). Sourced from `DETECT_JOB_CONFIG` (types/remix.ts) — the store-facing
// mapping the API client + store action also read — so UI + store never drift.

import {
  DETECT_JOB_CONFIG,
  type DetectPlane,
  type RemixJobPhase,
} from '@/types/remix';

export type { DetectPlane };

export interface DetectPlaneConfig {
  /** Scope field name in the enqueue body — `sprite_id` (sprite) | `batch_id` (mix). */
  scopeKey: 'sprite_id' | 'batch_id';
  /** Enqueue endpoint segment — POST `/api/jobs/remix/{remixId}/{endpoint}`. */
  endpoint: string;
  /** Job phase == dedup family. The 2 are SEPARATE → sprite-check + mix-check
   *  run in parallel + dedup independently. Also the `jobs[]` filter key. */
  jobType: RemixJobPhase;
  /** Backend core reference (tham chiếu) — sprite = human-ref (06), mix =
   *  variant-sheet (07), rmbg = RGBA cut-out (08). */
  coreDoc: '06' | '07' | '08';
}

export const DETECT_PLANE_CONFIG: Record<DetectPlane, DetectPlaneConfig> = {
  sprite: {
    scopeKey: DETECT_JOB_CONFIG.sprite.scopeKey,
    endpoint: DETECT_JOB_CONFIG.sprite.endpointSegment,
    jobType: DETECT_JOB_CONFIG.sprite.phase,
    coreDoc: '06',
  },
  mix: {
    scopeKey: DETECT_JOB_CONFIG.mix.scopeKey,
    endpoint: DETECT_JOB_CONFIG.mix.endpointSegment,
    jobType: DETECT_JOB_CONFIG.mix.phase,
    coreDoc: '07',
  },
  // ⚡2026-06-28 — rmbg plane (Remove BG tab Check); batch scope (mirror mix).
  rmbg: {
    scopeKey: DETECT_JOB_CONFIG.rmbg.scopeKey,
    endpoint: DETECT_JOB_CONFIG.rmbg.endpointSegment,
    jobType: DETECT_JOB_CONFIG.rmbg.phase,
    coreDoc: '08',
  },
};
