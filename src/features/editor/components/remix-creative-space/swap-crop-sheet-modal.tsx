// swap-crop-sheet-modal.tsx — Phase 07 stub. Real implementation depends on
// backend AI swap endpoints (deferred).

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SwapCropSheetTarget } from '@/types/remix';

interface Props {
  target: SwapCropSheetTarget;
  onClose: () => void;
}

export function SwapCropSheetModal({ target, onClose }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap Crop Sheet</DialogTitle>
          <DialogDescription>
            Coming soon — depends on backend AI swap endpoints.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted px-3 py-2 text-xs">
          Entity: {target.type} / {target.key}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
