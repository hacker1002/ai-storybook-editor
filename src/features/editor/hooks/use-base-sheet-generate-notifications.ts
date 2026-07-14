// use-base-sheet-generate-notifications.ts — watches the single-flight base-sheet generate op and
// fires ONE error toast when it settles with an error, then dismisses it. SUCCESS is intentionally
// silent (per-style inline status is enough — one style generated per run); partial-crop warnings
// are toasted by the slice itself. Mount once at editor-page level so the toast fires regardless of
// which creative space is active. Also feeds the nav-guard indirectly via useIsAnySketchGenerating.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { BaseSheetGenerateOp } from '@/stores/snapshot-store/types';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'BaseSheetGenerateNotifications');

/**
 * Side-effect-only hook. React 19: prevRef is read/written ONLY inside the effect body (never in the
 * render body). The op carries an already-classified friendly `error`; when it first appears we toast
 * once and dismiss (op → null). On the next render op is null so the guard won't refire (no double
 * toast). Each producer mints a new op ref, so the [op] dep fires on every phase/error transition.
 */
export function useBaseSheetGenerateNotifications(): void {
  const prevRef = useRef<BaseSheetGenerateOp | null>(null);
  const op = useSnapshotStore((s) => s.baseSheetGenerateOp);

  useEffect(() => {
    const prev = prevRef.current;
    // Error just appeared on the current op (settled-with-error) → toast once + dismiss.
    if (op?.error && prev?.error !== op.error) {
      log.warn('toast', 'base sheet op error', { kind: op.kind, styleIndex: op.styleIndex });
      toast.error(op.error);
      useSnapshotStore.getState().dismissBaseSheetGenerateError();
    }
    prevRef.current = op;
  }, [op]);
}
