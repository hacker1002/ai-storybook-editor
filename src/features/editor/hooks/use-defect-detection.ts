// use-defect-detection.ts — Generic state hook for the swap-defect Check
// (design 05-15 §4.3). ONE hook serves BOTH planes (sprite tab Variants + mix
// tab Crops): it derives the detect task + per-sheet defects + the latest job's
// createdAt (stale-guard anchor) from the per-remix `jobs[]` slice, keyed by the
// plane's job-type (resolved via `DETECT_PLANE_CONFIG`). Mirrors the swapTask
// derivation — defects ride the same realtime channel via `background_jobs.result`.
//
// NOTE on `run`: the spec's convenience `run()` is intentionally NOT returned —
// row enqueue flows through the modal's `onDetect{Sprite,Batch}` callbacks which
// carry the LIVE swap params (right-sidebar) + auto-select the scope; the hook
// has no access to those params, so a param-less `run` would enqueue with the
// wrong intent. This hook is the read-only overlay/state source only.
//
// SECURITY: returns counts/severities/timestamps + the raw defects array for the
// overlay; never logs `defect.message` / media / human data (PII §10).

import { useMemo } from 'react';
import {
  useRemixStore,
  useJobsForRemix,
  deriveDetectView,
  type DetectView,
} from '@/stores/remix-store';
import type { DefectSheetResult, RemixJobPhase } from '@/types/remix';
import { DETECT_PLANE_CONFIG, type DetectPlane } from '@/features/editor/components/remix-creative-space/swap-crop-sheet-modal/detect-plane-config';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useDefectDetection');

/** Stable empty defects ref for the unresolved (no remix/scope) case — keeps the
 *  projected ref steady (memory feedback_zustand_useshallow_nested_arrays). */
const EMPTY_DEFECTS: DefectSheetResult[] = [];

/** Derive the detect view for ONE scope on a given plane. `scopeId` = sprite_id
 *  (sprite) | batch_id (mix). Returns `{ task, defectsBySheet, jobCreatedAt }`.
 *  Memoized on the per-remix `jobs` slice + scope + plane so the projected
 *  `defectsBySheet` ref is stable until a relevant job updates. */
export function useDefectDetection(
  plane: DetectPlane,
  remixId: string | null | undefined,
  scopeId: string | null | undefined,
): DetectView {
  const jobs = useJobsForRemix(remixId ?? '');
  const jobType = DETECT_PLANE_CONFIG[plane].jobType;
  return useMemo<DetectView>(() => {
    if (!remixId || !scopeId) {
      log.debug('useDefectDetection', 'idle (no remix/scope)', { plane });
      return { task: { state: 'idle' }, defectsBySheet: EMPTY_DEFECTS };
    }
    return deriveDetectView(jobs, remixId, scopeId, jobType);
  }, [jobs, remixId, scopeId, jobType, plane]);
}

/** True when ANY detect job of `jobType` is queued/running for the remix. Gates
 *  every Check button of THAT plane (detect dedups per plane). The 2 planes have
 *  separate job-types → sprite-check + mix-check are independent. Boolean
 *  primitive — ref-stable by value (no useShallow needed). */
export function useAnyDetectRunning(
  remixId: string | null | undefined,
  jobType: RemixJobPhase,
): boolean {
  return useRemixStore(
    (s) =>
      !!remixId &&
      s.jobs.some(
        (j) =>
          j.phase === jobType &&
          j.remixId === remixId &&
          (j.status === 'queued' || j.status === 'running'),
      ),
  );
}
