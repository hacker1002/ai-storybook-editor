// use-variant-sheet-generate-notifications.ts — watches the single-flight variant-sheet generate op
// and fires ONE error toast when it settles with an error, then dismisses it. SUCCESS is silent
// (per-row inline status is enough); partial-crop warnings are toasted by the slice itself. Mount
// once at editor-page level so the toast fires regardless of which creative space is active.
//
// ⚡ Double-toast guard: the variant generate is snapshot-reading, so the slice toasts the
//    NO_SNAPSHOT precondition DIRECTLY (and keeps the errored op). For that one message we ONLY
//    dismiss here (no second toast); every other error is toasted once by this hook.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { VariantSheetGenerateOp } from '@/stores/snapshot-store/types';
import { NO_SNAPSHOT_MESSAGE } from '@/stores/snapshot-store/slices/sketch-variant-generate-job-slice';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'VariantSheetGenerateNotifications');

/**
 * Side-effect-only hook. React 19: prevRef is read/written ONLY inside the effect body (never in the
 * render body). The op carries an already-classified friendly `error`; when it first appears we toast
 * once (unless the slice already toasted it — NO_SNAPSHOT) and dismiss (op → null). On the next render
 * op is null so the guard won't refire. Each producer mints a new op ref, so [op] fires on every
 * phase/error transition.
 */
export function useVariantSheetGenerateNotifications(): void {
  const prevRef = useRef<VariantSheetGenerateOp | null>(null);
  const op = useSnapshotStore((s) => s.variantSheetGenerateOp);

  useEffect(() => {
    const prev = prevRef.current;
    // Error just appeared on the current op (settled-with-error) → toast once + dismiss.
    if (op?.error && prev?.error !== op.error) {
      if (op.error !== NO_SNAPSHOT_MESSAGE) {
        log.warn('toast', 'variant sheet op error', {
          kind: op.kind,
          entityKey: op.entityKey,
          variantKey: op.variantKey,
        });
        toast.error(op.error);
      }
      useSnapshotStore.getState().dismissVariantSheetGenerateError();
    }
    prevRef.current = op;
  }, [op]);
}
