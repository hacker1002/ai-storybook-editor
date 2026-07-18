// use-stage-sheet-generate-notifications.ts — watches the single-flight STAGE-sheet generate op
// and fires ONE error toast when it settles with an error, then dismisses it. SUCCESS is silent
// (per-row inline status is enough); geometry warnings are toasted by the slice itself. Mount
// once at editor-page level so the toast fires regardless of which creative space is active.
// Mirror of use-variant-sheet-generate-notifications (same double-toast guard for the
// slice-toasted NO_SNAPSHOT precondition).

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { StageSheetGenerateOp } from '@/stores/snapshot-store/types';
import { STAGE_NO_SNAPSHOT_MESSAGE } from '@/stores/snapshot-store/slices/sketch-stage-generate-job-slice';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'StageSheetGenerateNotifications');

/**
 * Side-effect-only hook. React 19: prevRef is read/written ONLY inside the effect body. The op
 * carries an already-classified friendly `error`; when it first appears we toast once (unless the
 * slice already toasted it — NO_SNAPSHOT) and dismiss (op → null).
 */
export function useStageSheetGenerateNotifications(): void {
  const prevRef = useRef<StageSheetGenerateOp | null>(null);
  const op = useSnapshotStore((s) => s.stageSheetGenerateOp);

  useEffect(() => {
    const prev = prevRef.current;
    if (op?.error && prev?.error !== op.error) {
      if (op.error !== STAGE_NO_SNAPSHOT_MESSAGE) {
        log.warn('toast', 'stage sheet op error', {
          stageKey: op.target.stageKey,
          target: op.target.target,
        });
        toast.error(op.error);
      }
      useSnapshotStore.getState().dismissStageSheetGenerateError();
    }
    prevRef.current = op;
  }, [op]);
}
