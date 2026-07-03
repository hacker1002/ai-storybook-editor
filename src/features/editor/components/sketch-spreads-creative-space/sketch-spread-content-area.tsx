// sketch-spread-content-area.tsx — right panel of the sketch-spread space.
// Renders the dedicated SketchSpreadCanvas (per-page images, fit-to-screen, no bleed/staging).
// This panel owns ONLY the Generate toolbar + regenerate confirm; all canvas interaction —
// textbox select/drag/resize/edit/delete, per-page locked images, selection state, zoom — lives
// inside SketchSpreadCanvas. Replaces the former CanvasSpreadView<BaseSpread> + SketchSpread→
// BaseSpread adapter + render-prop path (removed in the dedicated-canvas cutover).

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { SketchSpreadCanvas } from './sketch-spread-canvas';
import { useSnapshotStore } from '@/stores/snapshot-store';
import {
  useSketchSpreadById,
  useSnapshotActions,
  useIsSketchSpreadGenerating,
  useSketchSpreadGenerateProgress,
  useIsAnySketchGenerating,
} from '@/stores/snapshot-store/selectors';
import { useCurrentBook } from '@/stores/book-store';
import { getSketchSpreadEffectiveUrl } from '@/types/sketch';
import { CANVAS_CONFIRM_DIALOG_Z } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchSpreadContentArea');

export interface SketchSpreadContentAreaProps {
  spreadId: string;
  /** Bulk-selected spread ids from the sidebar (checkbox multi-select). Generate targets these
   *  when non-empty, else the single focused spread. Threaded from the parent creative space. */
  checkedSpreadIds: string[];
}

export function SketchSpreadContentArea({ spreadId, checkedSpreadIds }: SketchSpreadContentAreaProps) {
  const spread = useSketchSpreadById(spreadId);
  const book = useCurrentBook();
  const { startSketchSpreadGenerateJob, cancelSketchSpreadGenerateJob } = useSnapshotActions();

  // Generate-job state (1 sketch job global). `anyGen` disables Generate while EITHER sketch job
  // (entity-sheet or spread-image) runs; isSpreadJob/progress reflect the spread-image job.
  const isSpreadJob = useIsSketchSpreadGenerating();
  const progress = useSketchSpreadGenerateProgress();
  const anyGen = useIsAnySketchGenerating();
  const [pendingTarget, setPendingTarget] = useState<string[] | null>(null);

  // Generate target: bulk-checked spreads if any, else the focused spread (job slice sorts doc-order).
  const target = checkedSpreadIds.length > 0 ? checkedSpreadIds : [spreadId];
  const canGenerate = !anyGen && Boolean(book?.artstyle_id) && target.length > 0;
  const label = isSpreadJob
    ? `Generating… (${progress?.done ?? 0}/${progress?.total ?? 0})`
    : checkedSpreadIds.length > 0
      ? `Generate (${checkedSpreadIds.length})`
      : 'Generate';

  const handleGenerate = () => {
    log.info('handleGenerate', 'start', { targetCount: target.length });
    if (!book?.artstyle_id) {
      log.debug('handleGenerate', 'blocked — no art style');
      toast.warning('Set an art style for this book first');
      return;
    }
    if (target.length === 0) {
      toast.info('Nothing to generate');
      return;
    }
    // Resolve "already has an image" at click-time via getState() (NOT a hook — React 19 forbids
    // hooks in callbacks). Any target with a per-page image (images[].illustrations) triggers the
    // regen confirm — getSketchSpreadEffectiveUrl is non-null once any page has been generated.
    const spreads = useSnapshotStore.getState().sketch.spreads;
    const hadExisting = target.some((id) => {
      const s = spreads.find((x) => x.id === id);
      return s ? getSketchSpreadEffectiveUrl(s) != null : false;
    });
    if (hadExisting) {
      setPendingTarget(target); // open regenerate confirm
    } else {
      startSketchSpreadGenerateJob({ spreadIds: target, artStyleId: book.artstyle_id });
    }
  };

  const confirmRegenerate = () => {
    if (pendingTarget && book?.artstyle_id) {
      log.info('confirmRegenerate', 'regenerate confirmed', { count: pendingTarget.length });
      startSketchSpreadGenerateJob({ spreadIds: pendingTarget, artStyleId: book.artstyle_id });
    }
    setPendingTarget(null);
  };

  // Race guard: parent re-focuses after a delete, but render null defensively.
  if (!spread) {
    log.debug('render', 'spread missing — render null', { spreadId });
    return null;
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden" role="region" aria-label="Spread canvas">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
          aria-busy={isSpreadJob}
          aria-label={label}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {label}
        </Button>
        {isSpreadJob && (
          <Button
            variant="outline"
            size="sm"
            onClick={cancelSketchSpreadGenerateJob}
            aria-label="Cancel generation"
          >
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <SketchSpreadCanvas spreadId={spreadId} />
      </div>

      {/* Regenerate confirm — mirrors the sidebar delete-confirm / entity-space regen dialog. */}
      <AlertDialog open={pendingTarget !== null} onOpenChange={(open) => !open && setPendingTarget(null)}>
        <AlertDialogContent zIndex={CANVAS_CONFIRM_DIALOG_Z}>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate spreads?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTarget?.length ?? 0} spread(s) already have a generated image. Regenerating
              creates a new version and selects it as the backdrop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
