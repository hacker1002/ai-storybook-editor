// crop-preset-confirm-dialog.tsx — Destructive confirm shown before deleting a crop preset
// book-wide (design 05-crops-tab.md §4.4). Deleting a preset removes it from EVERY image's
// dropdown in the book and cannot be undone, so the sidebar 🗑 on a preset-linked box routes
// here first.
//
// Mirrors relayout-confirm-dialog: the AlertDialog normally portals to <body>, which lands it
// OUTSIDE the extract modal's DOM → the modal's Interaction-Layer-Stack click-outside router
// would read every confirm click (buttons AND dim overlay) as "outside" → close the whole
// modal. We resolve the modal's `[role=dialog]` ancestor and portal INTO it so all confirm
// clicks count as inside the modal layer. Radix handles Escape (→ onCancel) and stops its
// propagation before the document-level ILS listener, so Esc cancels the dialog (not the modal).

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
import { Z_INDEX } from './extract-image-modal-constants';

export interface CropPresetConfirmDialogProps {
  /** Open while a preset delete awaits confirmation (cropsState.confirmDeleteBoxId !== null). */
  open: boolean;
  /** Preset/box title for the confirm copy scope. */
  presetTitle: string;
  /** User confirmed → delete the preset book-wide + remove the box. */
  onConfirm: () => void;
  /** User cancelled / dismissed → keep the preset. */
  onCancel: () => void;
}

export function CropPresetConfirmDialog({
  open,
  presetTitle,
  onConfirm,
  onCancel,
}: CropPresetConfirmDialogProps) {
  // Resolve the enclosing modal as the portal target (see file header). Callback ref instead
  // of useEffect+setState (React 19 lint). The marker renders in-place inside the modal DOM,
  // so its `[role=dialog]` ancestor IS the extract modal.
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
        // `text-foreground` (dark) required: portaled INSIDE the modal, the content would
        // otherwise inherit --swap-modal-text-primary (white) → white-on-white on the white bg.
        className="text-foreground sm:max-w-[440px]"
        // Override the shared z-50 — must paint ABOVE the full-screen modal (swapModal=4000)
        // and the per-box preset Select dropdown (selectDropdown=4100).
        style={{ zIndex: Z_INDEX.confirmDialog }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete crop preset?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{presetTitle}&rdquo; will be removed from every image in this book. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
