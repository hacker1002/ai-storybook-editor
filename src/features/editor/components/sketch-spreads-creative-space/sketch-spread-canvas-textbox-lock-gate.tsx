// sketch-spread-canvas-textbox-lock-gate.tsx — per-textbox lock-status adapter.
//
// The canvas renders textboxes in a `.map()`, so it cannot call the phase-02 grey-out
// selectors per item directly (a hook per loop iteration breaks rules-of-hooks). A KEYED
// component instance per iteration is the legal pattern: this thin gate subscribes ONE
// textbox's lock target (resource_type 2, per-language) and hands the result back via a
// render-prop, keeping all the heavy per-textbox render logic in the canvas closure.

'use client';

import type { ReactNode } from 'react';
import {
  useIsLockedByOther,
  useLockHolderName,
  type LockTarget,
} from '@/stores/resource-lock-store';

export interface SketchTextboxLockGateProps {
  /** SketchTextbox.id — the lock resource_id (type 2). */
  textboxId: string;
  /** Current header language — the textbox lock is per-locale. */
  langCode: string;
  /** Render-prop: receives whether ANOTHER editor holds this textbox + their display name. */
  children: (lockedByOther: boolean, holderName: string | null) => ReactNode;
}

/** Subscribes one textbox's other-holder lock status and exposes it via render-prop. */
export function SketchTextboxLockGate({ textboxId, langCode, children }: SketchTextboxLockGateProps) {
  const target: LockTarget = { step: 1, resource_type: 2, resource_id: textboxId, locale: langCode };
  const lockedByOther = useIsLockedByOther(target);
  const holderName = useLockHolderName(target);
  return <>{children(lockedByOther, holderName)}</>;
}

export default SketchTextboxLockGate;
