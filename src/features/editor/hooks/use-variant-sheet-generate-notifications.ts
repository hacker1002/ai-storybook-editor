// use-variant-sheet-generate-notifications.ts — watches the variant-sheet generate ops MAP (N
// variants generate in parallel) and fires ONE error toast per key when that op settles with an
// error, then dismisses it. SUCCESS is silent (per-row inline status is enough); partial-crop
// warnings are toasted by the slice itself. Mount once at editor-page level so the toast fires
// regardless of which creative space is active.
//
// ⚡ Double-toast guard: the variant generate is snapshot-reading, so the slice toasts the
//    NO_SNAPSHOT precondition DIRECTLY (and keeps the errored op). For that one message we ONLY
//    dismiss here (no second toast); every other error is toasted once by this hook.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { VariantOpKey } from '@/stores/snapshot-store/types';
import { NO_SNAPSHOT_MESSAGE } from '@/stores/snapshot-store/slices/sketch-variant-generate-job-slice';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VariantSheetGenerateNotifications');

/**
 * Side-effect-only hook. React 19: prevRef is read/written ONLY inside the effect body (never in the
 * render body). It holds the last seen error PER KEY, so a second variant failing does not inherit
 * the first one's "already toasted" state. Rebuilt from the current map on every run, which also
 * drops keys whose op is gone (no unbounded growth).
 */
export function useVariantSheetGenerateNotifications(): void {
  const prevErrorsRef = useRef<Record<VariantOpKey, string>>({});
  const ops = useSnapshotStore((s) => s.variantSheetGenerateOps);

  useEffect(() => {
    const prev = prevErrorsRef.current;
    const next: Record<VariantOpKey, string> = {};

    for (const [key, op] of Object.entries(ops)) {
      if (!op.error) continue;
      next[key] = op.error;
      if (prev[key] === op.error) continue; // already toasted this exact failure
      if (op.error !== NO_SNAPSHOT_MESSAGE) {
        log.warn('toast', 'variant sheet op error', {
          kind: op.kind,
          entityKey: op.entityKey,
          variantKey: op.variantKey,
        });
        toast.error(op.error);
      }
      useSnapshotStore.getState().dismissVariantSheetGenerateError({
        kind: op.kind,
        entityKey: op.entityKey,
        variantKey: op.variantKey,
      });
    }

    prevErrorsRef.current = next;
  }, [ops]);
}
