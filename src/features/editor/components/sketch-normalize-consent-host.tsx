// sketch-normalize-consent-host.tsx — global host for the sketch-normalize CONSENT modal
// (ADR-047 phase-03). Mounted ONCE in App.tsx next to <Toaster/> (outside the router, so it
// survives navigation) — the repo's first store→UI dialog host, deliberately SPECIALIZED to this
// one use (no generic confirm framework — YAGNI).
//
// The row list derives from snapshot-store `sketchDegraded` (populated by loadSketch and the
// content-sync merge path); dismissed rows come from sketch-consent-store (session-only, D11).
// Open/close is fully DERIVED — no set-state-in-effect (React 19). Checkbox state is local and
// resets via `key=` remount whenever the row SET changes (a new merge-path anomaly appended to
// an open modal clears any in-progress checks — deliberate: back to the all-unchecked fail-safe
// default, the user re-confirms against the full current list).
//
// FAIL-SAFE by construction: the save-block is active BEFORE this modal ever renders (loadSketch
// marks degraded synchronously). Closing/ESC/ignoring the modal keeps everything blocked — the
// modal only ever UNBLOCKS (per-resource, checkbox consent), never blocks.

import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CANVAS_CONFIRM_DIALOG_Z } from '@/constants/spread-constants';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useSketchConsentStore, dismissKeyOf } from '@/stores/sketch-consent-store';
import type { SketchDegradedEntry } from '@/stores/snapshot-store/slices/sketch-normalize';
import { describeResource, describeResetImpact } from '@/stores/snapshot-store/slices/sketch-resource-registry';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchNormalizeConsentHost');

/** One modal row = one RESOURCE (several anomalies on the same resource collapse into it). */
interface ConsentRow {
  resource: SketchDegradedEntry['resource'];
  title: string;
  impact: string;
  messages: string[];
  dismissKeys: string[];
}

function buildRows(entries: SketchDegradedEntry[]): ConsentRow[] {
  const byResource = new Map<string, ConsentRow>();
  for (const e of entries) {
    const row = byResource.get(e.resource);
    if (row) {
      row.messages.push(e.message);
      row.dismissKeys.push(dismissKeyOf(e));
    } else {
      byResource.set(e.resource, {
        resource: e.resource,
        title: describeResource(e.resource),
        impact: describeResetImpact(e.resource),
        messages: [e.message],
        dismissKeys: [dismissKeyOf(e)],
      });
    }
  }
  return Array.from(byResource.values());
}

export function SketchNormalizeConsentHost() {
  const entries = useSnapshotStore((s) => s.sketchDegraded);
  const dismissedKeys = useSketchConsentStore((s) => s.dismissedKeys);

  // Open while ANY degraded entry has not been dismissed this session. Purely derived.
  const hasFresh = entries.some((e) => !dismissedKeys.includes(dismissKeyOf(e)));
  if (!hasFresh) return null;

  // Remount the dialog body whenever the ROW SET changes (new resource appended by a merge-path
  // anomaly) so checkbox state initializes fresh without set-state-in-effect.
  const rowsKey = entries.map((e) => dismissKeyOf(e)).sort().join('|');
  return <ConsentDialog key={rowsKey} entries={entries} />;
}

function ConsentDialog({ entries }: { entries: SketchDegradedEntry[] }) {
  const rows = useMemo(() => buildRows(entries), [entries]);
  const [checked, setChecked] = useState<Record<string, boolean>>({}); // default unchecked = safe
  const accept = useSketchConsentStore((s) => s.accept);
  const dismiss = useSketchConsentStore((s) => s.dismiss);

  const checkedResources = rows.filter((r) => checked[r.resource]).map((r) => r.resource);

  const dismissAll = () => {
    log.info('dismissAll', 'user kept every resource degraded', { rows: rows.length });
    dismiss(rows.flatMap((r) => r.dismissKeys));
  };

  const resetChecked = () => {
    if (checkedResources.length === 0) return;
    log.info('resetChecked', 'user consented to reset', { resources: checkedResources });
    accept(checkedResources);
    // Unchecked rows = "để nguyên": keep them degraded but stop re-prompting this session.
    dismiss(rows.filter((r) => !checked[r.resource]).flatMap((r) => r.dismissKeys));
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && dismissAll()}>
      <AlertDialogContent zIndex={CANVAS_CONFIRM_DIALOG_Z} className="sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Dữ liệu sketch có cấu trúc không đọc được</AlertDialogTitle>
          <AlertDialogDescription>
            Hệ thống phát hiện {rows.length} phần dữ liệu không đúng cấu trúc.{' '}
            <strong className="font-medium text-foreground">Chưa có gì bị xoá</strong> — các phần
            này đang ở chế độ chỉ đọc và <strong className="font-medium text-foreground">không thể lưu</strong>{' '}
            cho tới khi bạn quyết định. Chọn mục muốn reset về rỗng, hoặc để nguyên và báo team.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[320px] space-y-3 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.resource} className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={!!checked[row.resource]}
                onCheckedChange={(next) =>
                  setChecked((prev) => ({ ...prev, [row.resource]: next }))
                }
                aria-label={row.title}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-1">
                <Label
                  className="cursor-pointer font-medium"
                  onClick={() =>
                    setChecked((prev) => ({ ...prev, [row.resource]: !prev[row.resource] }))
                  }
                >
                  {row.title}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {row.messages[0]}
                  {row.messages.length > 1 ? ` (+${row.messages.length - 1} lỗi khác)` : ''}
                </p>
                <p className="text-sm text-destructive">{row.impact}</p>
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={dismissAll}>
            Để nguyên (chỉ đọc)
          </Button>
          <Button
            variant="destructive"
            disabled={checkedResources.length === 0}
            onClick={resetChecked}
          >
            Reset các mục đã chọn
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
