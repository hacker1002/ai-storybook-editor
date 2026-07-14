// generate-style-modal.tsx — Compact "Generate: Style N" dialog (design 03). Prompt textarea +
// ≤3 reference images → enqueues a base-sheet generate job, then closes IMMEDIATELY (the async
// job streams raw sheet + crops into the store; base entities are injected AT THE SLICE, never
// threaded through this modal). Used for both `add` (append a style) and `regenerate`
// (overwrite styles[styleIndex]). Generate is gated on prompt + a resolved sketch art-style id.

import { useCallback, useRef, useState } from 'react';
import { Paperclip, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useSketchBaseStyles,
  useSnapshotActions,
  useIsAnySketchGenerating,
} from '@/stores/snapshot-store/selectors';
import { useSketchStyleId } from '@/stores/book-store';
import { useInteractionLayer } from '@/features/editor/contexts';
import { useReferenceImagePicker } from '@/features/editor/hooks/use-reference-image-picker';
import type { BaseKind } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'GenerateStyleModal');

/** Base sheets take ≤3 style reference images (design §2). */
const MAX_REFS = 3;

export interface GenerateStyleModalProps {
  kind: BaseKind;
  mode: 'add' | 'regenerate';
  /** Required for `regenerate` — the style being overwritten (seeds the prompt). */
  styleIndex?: number;
  /** Fired right after the job is enqueued with the target style index → lets the root select it
   *  (add appends to the end) so the content-area "Generating…" overlay shows the new style. */
  onEnqueued?: (kind: BaseKind, styleIndex: number) => void;
  onClose: () => void;
}

export function GenerateStyleModal({ kind, mode, styleIndex, onEnqueued, onClose }: GenerateStyleModalProps) {
  const styles = useSketchBaseStyles(kind);
  // book.sketchstyle_id (art_styles.type=0) — REQUIRED by the sketch generate endpoint (a
  // sketch-generate exception to the "no artStyleId" rule); Generate is blocked while null.
  const artStyleId = useSketchStyleId();
  const { startBaseSheetGenerate } = useSnapshotActions();
  // Cross-job single-flight guard: the slice bails (warn-only) if any sketch generation is already
  // running → block Generate here so the modal can't close as if it worked (no silent drop).
  const isAnyGenerating = useIsAnySketchGenerating();
  // Destructure (don't hold the picker object) so the reference-list array is a plain binding —
  // passing the picker's inputRef into a `ref=` prop otherwise taints member reads in render.
  const { images, inputRef, openPicker, handleFilesSelected, removeImage, clearImages } =
    useReferenceImagePicker(MAX_REFS);

  // "Style N": add → next index; regenerate → the style's own 1-based label.
  const styleNumber = mode === 'add' ? styles.length + 1 : (styleIndex ?? 0) + 1;

  // Regenerate seeds the prompt from the existing style. (Phase 03 stores image_references: [],
  // so regenerate ref chips start empty — accepted for v1; the picker still allows adding refs.)
  const [prompt, setPrompt] = useState(() =>
    mode === 'regenerate' && styleIndex != null ? (styles[styleIndex]?.style_prompt ?? '') : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);

  const canGenerate = !isSubmitting && prompt.trim().length > 0 && !!artStyleId && !isAnyGenerating;

  const handleGenerate = useCallback(() => {
    if (!canGenerate || !artStyleId) {
      log.debug('handleGenerate', 'blocked — gate not met', {
        hasPrompt: prompt.trim().length > 0,
        hasArtStyle: !!artStyleId,
        isAnyGenerating,
      });
      return;
    }
    // Pass picker images straight through (label + base64). The slice uploads them to storage,
    // persists {title, media_url} on the style, and sends media_url refs to the generate backend.
    // add appends to the end (new index = current length); regenerate overwrites styleIndex.
    const targetIndex = mode === 'add' ? styles.length : (styleIndex ?? 0);
    log.info('handleGenerate', 'enqueue base sheet generate', {
      kind,
      mode,
      styleIndex: targetIndex,
      refCount: images.length,
    });
    setIsSubmitting(true);
    startBaseSheetGenerate({
      kind,
      mode,
      styleIndex: mode === 'regenerate' ? styleIndex : undefined,
      stylePrompt: prompt.trim(),
      referenceImages: images,
      artStyleId,
    });
    // Select the (just-enqueued) style so the content-area overlay shows it generating.
    onEnqueued?.(kind, targetIndex);
    // Close immediately after enqueue — results stream into the style via the store.
    clearImages();
    onClose();
  }, [canGenerate, artStyleId, isAnyGenerating, images, styles.length, clearImages, kind, mode, styleIndex, prompt, startBaseSheetGenerate, onEnqueued, onClose]);

  const handleRequestClose = useCallback(() => {
    if (isSubmitting) return; // Escape / click-outside inert while the enqueue is in flight
    onClose();
  }, [isSubmitting, onClose]);

  useInteractionLayer('modal', {
    id: 'generate-style-modal',
    ref: modalContentRef,
    captureClickOutside: true,
    hotkeys: ['Escape'],
    onHotkey: (key) => {
      if (key === 'Escape') handleRequestClose();
    },
    onClickOutside: handleRequestClose,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && handleRequestClose()}>
      <DialogContent
        ref={modalContentRef}
        className="max-w-[480px]"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Generate: Style {styleNumber}</DialogTitle>
          <DialogDescription className="sr-only">
            Enter a style prompt and optional reference images to generate the base sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* Header row: title + reference chips (right of the title) + attach button (pinned right). */}
          <div className="flex items-center gap-2">
            <Label htmlFor="style-prompt" className="shrink-0">
              Prompt
            </Label>
            {images.length > 0 && (
              <div className="flex flex-1 flex-wrap gap-1.5" aria-label="Reference images">
                {images.map((img, idx) => (
                  <div
                    key={`ref-${img.label}-${idx}`}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                  >
                    <span className="max-w-[120px] truncate">{img.label}</span>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="rounded hover:text-foreground"
                      aria-label={`Remove reference image ${img.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 shrink-0"
              onClick={openPicker}
              disabled={isSubmitting || images.length >= MAX_REFS}
              aria-label="Attach reference images"
              title={images.length >= MAX_REFS ? `Max ${MAX_REFS} reference images` : 'Attach reference images'}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
          </div>

          <Textarea
            id="style-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter prompt…"
            className="min-h-[112px] text-sm"
            aria-label="Style prompt"
            disabled={isSubmitting}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
        </div>

        {!artStyleId && (
          <p className="text-xs text-destructive" role="status">
            No sketch art style set for this book — set it before generating a base sheet.
          </p>
        )}

        {isAnyGenerating && (
          <p className="text-xs text-muted-foreground" role="status">
            Another generation is in progress — please wait for it to finish.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleRequestClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate} aria-busy={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
