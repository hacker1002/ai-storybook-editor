// sketch-spread-error-detail-modal.tsx — chi tiết lỗi của LẦN generate spread-image gần nhất.
// Opened by the summary toast's "Xem chi tiết" action (store flag — the toast lives in the
// editor-root notifications hook, this modal mounts in the sketch-spread space; no prop drill).
// Data source: sketchSpreadLastErrors — the failed-task snapshot RETAINED at job finalize, so it
// survives the job dismiss. Renders `failures[].message` VERBATIM: the lines are complete
// Vietnamese copy BUILT BY THE BACKEND (entity name + kind + reason) — the FE composes nothing.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useSketchSpreadErrorModalOpen,
  useSketchSpreadLastErrors,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import type { SketchSpreadFailedEntry } from '@/stores/snapshot-store/types';
import { CANVAS_CONFIRM_DIALOG_Z } from '@/constants/spread-constants';
import { PAGE_LABELS } from './edit-spread-modal.constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchSpreadErrorDetailModal');

function entryTitle(entry: SketchSpreadFailedEntry): string {
  const num = entry.spreadNumber ? `Spread ${entry.spreadNumber}` : 'Spread';
  return entry.page ? `${num} · ${PAGE_LABELS[entry.page]}` : num;
}

function EntryBlock({ entry }: { entry: SketchSpreadFailedEntry }) {
  const { error } = entry;
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{entryTitle(entry)}</p>
      {error.failures && error.failures.length > 0 ? (
        // Per-image findings — BE-built VI messages rendered nguyên văn, code muted for debug.
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {error.failures.map((f, i) => (
            <li key={i}>
              {f.message}{' '}
              <span className="text-xs text-muted-foreground">({f.code})</span>
            </li>
          ))}
        </ul>
      ) : (
        // Single-code error (vd SPREAD_NO_ART_DIRECTION / network) → the summary message.
        <p className="mt-2 text-sm">{error.message}</p>
      )}
      {error.errorCode && (
        <p className="mt-2 text-xs text-muted-foreground">Mã lỗi: {error.errorCode}</p>
      )}
    </div>
  );
}

/** Props-less — reads the store (open flag + retained last-errors). Mounted once at
 *  editor ROOT (next to the notifications hook) so the toast action works from any space. */
export function SketchSpreadErrorDetailModal() {
  const open = useSketchSpreadErrorModalOpen();
  const entries = useSketchSpreadLastErrors();
  const { closeSketchSpreadErrorModal } = useSnapshotActions();

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      log.debug('handleOpenChange', 'close', { entries: entries.length });
      closeSketchSpreadErrorModal();
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent zIndex={CANVAS_CONFIRM_DIALOG_Z} className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết lỗi tạo ảnh spread</DialogTitle>
          <DialogDescription>
            {entries.length > 0
              ? `${entries.length} spread gặp lỗi trong lần tạo ảnh gần nhất.`
              : 'Không còn dữ liệu lỗi của lần tạo ảnh gần nhất.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <EntryBlock key={`${entry.spreadId}-${i}`} entry={entry} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
