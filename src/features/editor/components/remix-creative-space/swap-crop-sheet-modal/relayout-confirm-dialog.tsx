// relayout-confirm-dialog.tsx — Confirm dialog shown before a destructive
// batch/sheet action that relayouts a batch and wipes ALL of its swap results
// (design 05-swap-crop-sheet-modal.md §2.3, Validation S1: applies to BOTH add
// sheet / remove sheet AND remove batch — every relayout that drops swap_results
// of a batch with ≥1 swap_result goes through this confirm).
//
// Built on the shared shadcn `AlertDialog` to match the codebase convention
// (delete-audio-dialog, delete-human-dialog, …) instead of `window.confirm`.
//
// Portal target: the AlertDialog normally portals to <body>, which lands it
// OUTSIDE the swap modal's DOM. The modal's Interaction-Layer-Stack click-outside
// router (`dialogContentRef.contains(target)`) would then read EVERY click on the
// confirm (buttons AND dim overlay) as "outside" → close the whole modal. We
// resolve the modal's `[role=dialog]` ancestor and portal INTO it so all confirm
// clicks count as inside the modal layer.

import { useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Z_INDEX } from './swap-modal-constants';

/** Which destructive batch action triggered the confirm — drives the body copy. */
export type RelayoutConfirmKind = 'add-sheet' | 'remove-sheet' | 'remove-batch';

export interface RelayoutConfirmDialogProps {
  /** Open while a destructive action awaits confirmation. */
  open: boolean;
  /** Destructive action kind — selects the warning copy. */
  kind: RelayoutConfirmKind;
  /** Batch name for the confirm message scope (e.g. "Batch 1"). */
  batchName: string;
  /** User confirmed → run the pending destructive action. */
  onConfirm: () => void;
  /** User cancelled / dismissed → drop the pending action. */
  onCancel: () => void;
}

function describe(kind: RelayoutConfirmKind, batchName: string): string {
  const tail = 'This action cannot be undone.';
  switch (kind) {
    case 'remove-batch':
      return `Batch "${batchName}" has swapped sheets. Deleting it will remove all swap results of this batch. ${tail}`;
    case 'add-sheet':
      return `Adding a sheet to "${batchName}" will recompute the entire batch layout and clear all existing swap results. ${tail}`;
    case 'remove-sheet':
    default:
      return `Removing a sheet from "${batchName}" will recompute the entire batch layout and clear all existing swap results. ${tail}`;
  }
}

/** Confirms a relayout-causing destructive action. The caller decides whether to
 *  mount this at all (only when the affected batch has ≥1 swap result). */
export function RelayoutConfirmDialog({
  open,
  kind,
  batchName,
  onConfirm,
  onCancel,
}: RelayoutConfirmDialogProps) {
  const title = kind === 'remove-batch' ? 'Delete batch?' : 'Recompute layout?';

  // Resolve the enclosing modal as the portal target (see file header). Callback
  // ref instead of useEffect+setState (React 19 lint). The marker renders in-place
  // inside the modal DOM, so its `[role=dialog]` ancestor IS the swap modal.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const markerRef = useCallback((el: HTMLSpanElement | null) => {
    setContainer(el ? (el.closest('[role="dialog"]') as HTMLElement | null) : null);
  }, []);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      <AlertDialogContent
        container={container}
        // `text-foreground` (dark) is required: portaled INSIDE the modal, the
        // content would otherwise inherit --swap-modal-text-primary (white) →
        // white-on-white text on the hardcoded white content bg.
        className="text-foreground sm:max-w-[440px]"
        // Override the shared z-50 — must paint ABOVE the full-screen swap modal
        // (Z_INDEX.swapModal=4000) or the popup is occluded (mounts but unseen).
        style={{ zIndex: Z_INDEX.confirmDialog }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {describe(kind, batchName)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
