// sketch-entity-content-area.tsx — right pane: toolbar (Generate/Cancel + job progress) and
// the entity sheet preview. Generate enqueues a SEQUENTIAL sketch-sheet job (1 API call/entity);
// the toolbar shows the job aggregate (done/total) while the preview reflects the FOCUSED entity
// (spinner / image / error+retry / empty). Regenerating entities that already have a sheet goes
// through a Radix AlertDialog; out-of-range targets (empty / >12 variants) are pre-validated
// client-side before enqueue so no doomed API call is sent (Validation S1).

import { useState } from 'react';
import { Sparkles, ImageOff, Loader2, X, AlertTriangle } from 'lucide-react';
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
import { useSnapshotStore } from '@/stores/snapshot-store';
import {
  useSketchEntityByKey,
  useSketchEntityGenerating,
  useSketchGenerateProgress,
  useIsSketchGenerating,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import { useCurrentBook } from '@/stores/book-store';
import type { SketchEntityKind } from '@/types/sketch';
import { titleCase, type KindConfig } from './sketch-variants-constants';
import { ImageDownloadButton } from '@/features/editor/components/shared-components/image-download-button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchEntityContentArea');

/** Backend caps a sheet at 12 variant cells; enforce client-side to avoid a doomed 400. */
const MAX_SHEET_VARIANTS = 12;

interface SketchEntityContentAreaProps {
  kind: SketchEntityKind;
  cfg: KindConfig;
  selectedEntityKey: string;
  checkedKeys: string[];
}

interface EligibleResult {
  eligible: string[];
  emptyCount: number;
  tooManyCount: number;
  hadExisting: boolean;
}

export function SketchEntityContentArea({
  kind,
  cfg,
  selectedEntityKey,
  checkedKeys,
}: SketchEntityContentAreaProps) {
  const entity = useSketchEntityByKey(kind, selectedEntityKey);
  const book = useCurrentBook();
  const focusGen = useSketchEntityGenerating(kind, selectedEntityKey);
  const progress = useSketchGenerateProgress();
  const isJobRunning = useIsSketchGenerating();
  const { startSketchGenerateJob, cancelSketchGenerateJob } = useSnapshotActions();
  const [pendingTarget, setPendingTarget] = useState<string[] | null>(null);

  const name = titleCase(selectedEntityKey);
  const target = checkedKeys.length > 0 ? checkedKeys : selectedEntityKey ? [selectedEntityKey] : [];
  const label = isJobRunning
    ? `Generating… (${progress?.done ?? 0}/${progress?.total ?? 0})`
    : checkedKeys.length > 0
      ? `Generate (${checkedKeys.length})`
      : 'Generate';
  const canGenerate = !isJobRunning && Boolean(book?.artstyle_id) && target.length > 0;

  // Resolve target keys → eligible (1..12 variants) at click-time via getState() (NOT a hook —
  // React 19 forbids hooks in callbacks). Empty-variant entities are skipped; >12 are flagged.
  const resolveEligible = (keys: string[]): EligibleResult => {
    const entities = useSnapshotStore.getState().sketch[kind];
    const picked = keys
      .map((k) => entities.find((e) => e.key === k))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    const emptyCount = picked.filter((e) => e.variants.length === 0).length;
    const tooManyCount = picked.filter((e) => e.variants.length > MAX_SHEET_VARIANTS).length;
    const eligibleEntities = picked.filter(
      (e) => e.variants.length >= 1 && e.variants.length <= MAX_SHEET_VARIANTS,
    );
    const eligible = eligibleEntities.map((e) => e.key);
    const hadExisting = eligibleEntities.some((e) => Boolean(e.media_url));
    return { eligible, emptyCount, tooManyCount, hadExisting };
  };

  const handleGenerate = () => {
    log.info('handleGenerate', 'start', { kind, targetCount: target.length });
    if (!book?.artstyle_id) {
      log.debug('handleGenerate', 'blocked — no art style', { kind });
      toast.warning('Set an art style for this book first');
      return;
    }
    const { eligible, emptyCount, tooManyCount, hadExisting } = resolveEligible(target);
    if (tooManyCount > 0) {
      toast.warning(
        `${tooManyCount} ${cfg.noun}(s) have more than ${MAX_SHEET_VARIANTS} variants — split them before generating`,
      );
    }
    if (emptyCount > 0) {
      log.debug('handleGenerate', 'skip empty-variant entities', { emptyCount });
    }
    if (eligible.length === 0) {
      log.debug('handleGenerate', 'nothing eligible to generate', { kind });
      toast.info('Nothing to generate');
      return;
    }
    if (hadExisting) {
      setPendingTarget(eligible); // open regenerate confirm
    } else {
      startSketchGenerateJob({ kind, entityKeys: eligible, artStyleId: book.artstyle_id });
    }
  };

  const confirmRegenerate = () => {
    if (pendingTarget && book?.artstyle_id) {
      log.info('confirmRegenerate', 'regenerate confirmed', { kind, count: pendingTarget.length });
      startSketchGenerateJob({ kind, entityKeys: pendingTarget, artStyleId: book.artstyle_id });
    }
    setPendingTarget(null);
  };

  const handleRetryFocus = () => {
    if (book?.artstyle_id && selectedEntityKey) {
      log.info('handleRetryFocus', 'retry focused entity', { kind, selectedEntityKey });
      startSketchGenerateJob({ kind, entityKeys: [selectedEntityKey], artStyleId: book.artstyle_id });
    }
  };

  return (
    <div className="flex flex-col h-full" role="region" aria-label={`${cfg.noun} content`}>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
          aria-busy={isJobRunning}
          aria-label={label}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {label}
        </Button>
        {isJobRunning && (
          <Button variant="outline" size="sm" onClick={cancelSketchGenerateJob} aria-label="Cancel generation">
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      {/* Preview — reflects the FOCUSED entity (not the whole job). Precedence:
          generating (image-or-empty behind overlay) → error+Retry (even if a stale image
          exists, so a failed regenerate is retryable) → image → empty. */}
      <div className="flex-1 overflow-auto p-6">
        <div className="relative flex h-full items-center justify-center">
          {focusGen.isGenerating ? (
            entity?.media_url ? (
              <SheetImage key={entity.media_url} src={entity.media_url} name={name} onRetry={handleRetryFocus} />
            ) : (
              <EmptyPreview cfg={cfg} />
            )
          ) : focusGen.error ? (
            <div className="flex flex-col items-center text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mb-3 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">{focusGen.error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={handleRetryFocus}>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : entity?.media_url ? (
            <SheetImage key={entity.media_url} src={entity.media_url} name={name} onRetry={handleRetryFocus} />
          ) : (
            <EmptyPreview cfg={cfg} />
          )}

          {/* Spinner overlay while the focused entity is being generated */}
          {focusGen.isGenerating && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-background/70"
              role="status"
              aria-label={`Generating ${name} sheet`}
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Generating {name} sheet…</p>
            </div>
          )}
        </div>
      </div>

      {/* Regenerate confirm — mirrors the delete-confirm AlertDialog in the sidebar */}
      <AlertDialog
        open={pendingTarget !== null}
        onOpenChange={(open) => !open && setPendingTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate sheets?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTarget?.length ?? 0} {cfg.noun}(s) already have a generated sheet. Regenerating
              overwrites them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Self-contained load state so switching entities never shows the previous entity's
// image while the new one downloads. Reset-on-src-change is done by remounting via
// `key={src}` at the call sites (NOT useEffect+setState — banned by the React 19 lint).
// On a dead storage URL (404), regenerate is the correct recovery — it produces a fresh
// file — so the error state offers Retry (spec 02 edge case), not just a static hint.
function SheetImage({ src, name, onRetry }: { src: string; name: string; onRetry: () => void }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // Callback ref covers the browser-cache race: a cached image can be `complete`
  // before React attaches onLoad, which then never fires → spinner would hang.
  const measureRef = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setStatus('loaded');
  };

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center text-center text-muted-foreground">
        <ImageOff className="h-10 w-10 mb-3 opacity-60" aria-hidden="true" />
        <p className="text-sm">Couldn't load {name} sheet</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* inline-block group shrink-wraps the object-contain image so the hover download
          button anchors to the image's rendered top-right corner (not the letterboxed cell). */}
      <div className="group relative inline-block max-h-full max-w-full">
        <img
          ref={measureRef}
          src={src}
          alt={`${name} sketch sheet`}
          onLoad={() => setStatus('loaded')}
          onError={() => {
            log.warn('SheetImage', 'sheet image failed to load', { name });
            setStatus('error');
          }}
          className={`max-h-full max-w-full object-contain rounded-md transition-opacity duration-200 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {status === 'loaded' && (
          <ImageDownloadButton
            url={src}
            filename={`${name}-sketch-sheet`}
            label={`Download ${name} sheet`}
            className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          />
        )}
      </div>
      {status === 'loading' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          role="status"
          aria-label={`Loading ${name} sheet`}
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </>
  );
}

function EmptyPreview({ cfg }: { cfg: KindConfig }) {
  return (
    <div className="flex flex-col items-center text-center text-muted-foreground">
      <ImageOff className="h-10 w-10 mb-3 opacity-60" aria-hidden="true" />
      <p className="text-sm">No {cfg.noun} sketch generated yet</p>
      <p className="text-xs mt-1">Generate a {cfg.noun} sheet to preview it here.</p>
    </div>
  );
}
