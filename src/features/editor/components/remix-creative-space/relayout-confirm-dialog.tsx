// relayout-confirm-dialog.tsx — Confirm dialog shown before a crop-sheet
// stepper action ([+] add / [−] remove) that would trigger a relayout and
// wipe every swap result of the entity (design 05-swap-crop-sheet-modal.md
// §2.3, Validation S1: applies to BOTH add and remove).
//
// Built on the shared shadcn `AlertDialog` to match the codebase convention
// (delete-audio-dialog, delete-human-dialog, …) instead of `window.confirm`.

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

export interface RelayoutConfirmDialogProps {
  /** Open while a stepper action awaits confirmation. */
  open: boolean;
  /** Human-readable variant name for the confirm message scope.
   *  Truthy → char/prop variant scope (relayout target = ONE variant of the
   *  entity); body copy names that variant. Falsy/undefined/null → mix entity
   *  scope (relayout target = whole entity); generic body copy. */
  variantName?: string | null;
  /** User confirmed → run the pending stepper action. */
  onConfirm: () => void;
  /** User cancelled / dismissed → drop the pending action. */
  onCancel: () => void;
}

/** Confirms a relayout-causing stepper action. The caller decides whether to
 *  mount this at all (only when some sheet of the variant has swap results). */
export function RelayoutConfirmDialog({
  open,
  variantName,
  onConfirm,
  onCancel,
}: RelayoutConfirmDialogProps) {
  // Branched copy (Phase 07): variant-scoped relayout names the variant so the
  // user knows only ONE variant's swap_results will be wiped. Mix-entity or
  // unnamed variant fallback uses the generic "entity này" copy. Both cases
  // emphasise the irreversible nature of the action.
  const description = variantName
    ? `Variant "${variantName}" có sheet đã được swap. Đổi số sheet sẽ tính lại layout của variant này và xoá toàn bộ swap result. Hành động này không thể hoàn tác.`
    : 'Đổi số sheet sẽ tính lại layout và xoá toàn bộ swap result của entity này. Hành động này không thể hoàn tác.';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Tính lại layout?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Tiếp tục
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
