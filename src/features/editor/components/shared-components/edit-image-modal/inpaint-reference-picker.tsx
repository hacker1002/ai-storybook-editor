// inpaint-reference-picker.tsx — Presentational reference-image picker for the Inpaint tab
// (design 04-inpaint-tab.md §1/§8.2/§8.5). One UNIFIED list (cap = `max`) fed by two sources:
//   • Upload from device  → `onOpenUpload` (hidden <input> lives here, wired to `onFilesSelected`)
//   • Pick a prop-variant → `onPick(candidate)` from the parent-resolved `candidates` grid
// Pure presentation — NO store / no state beyond the local Popover open flag. The owning hook
// (useInpaintTabState, Phase 04) supplies `images` + the handlers. Split into its own file to keep
// inpaint-tab.tsx under the 500-loc cap.

import { useState } from 'react';
import { Plus, X, Check, Upload } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createLogger } from '@/utils/logger';
import { Z_INDEX, SWAP_MODAL_TOKENS } from './edit-image-modal-constants';
import type { PickedReferenceImage, ReferenceImageCandidate } from './edit-image-modal-utils';

const log = createLogger('Editor', 'InpaintReferencePicker');

// PopoverContent renders in a Radix Portal (attached to <body>) — OUTSIDE the DialogContent subtree
// that defines the `--swap-modal-*` CSS vars. So we must (a) redeclare SWAP_MODAL_TOKENS on the
// portaled content itself or every `var(--swap-modal-*)` inside resolves to nothing (transparent bg
// + dark text), and (b) set the z so it paints above the full-screen modal (z 4000). The panel bg
// uses the OPAQUE card token (`--swap-modal-surface` is near-transparent — fine layered over the
// modal, but a floating portal has no backdrop behind it).
const POPOVER_CONTENT_STYLE = { ...SWAP_MODAL_TOKENS, zIndex: Z_INDEX.selectDropdown };
const SECTION_LABEL_CLASS =
  'mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';
const TILE_CLASS =
  'flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] hover:text-[var(--swap-modal-text-primary)] disabled:cursor-not-allowed disabled:opacity-40';

export interface InpaintReferencePickerProps {
  /** Current picked list (upload + prop, GỘP). */
  images: PickedReferenceImage[];
  /** Parent-resolved prop-variant candidates (already filtered to non-null media_url). */
  candidates: ReferenceImageCandidate[];
  /** Combined cap (INPAINT_REF_MAX). */
  max: number;
  /** Hidden <input type=file> ref owned by the picker hook. */
  fileInputRef: React.Ref<HTMLInputElement>;
  /** Open the native file dialog (refs.openPicker). */
  onOpenUpload: () => void;
  /** Hidden input change handler (refs.handleFilesSelected). */
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Convert-on-add a picked prop-variant (Phase 04 fetches → base64 → append). */
  onPick: (c: ReferenceImageCandidate) => void;
  /** Remove one picked item by index (refs.removeImage). */
  onRemove: (index: number) => void;
}

export function InpaintReferencePicker({
  images,
  candidates,
  max,
  fileInputRef,
  onOpenUpload,
  onFilesSelected,
  onPick,
  onRemove,
}: InpaintReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const capped = images.length >= max;

  const handleUploadClick = () => {
    log.debug('handleUploadClick', 'open file dialog');
    setOpen(false);
    onOpenUpload();
  };

  const handlePick = (c: ReferenceImageCandidate) => {
    log.debug('handlePick', 'pick candidate', { id: c.id });
    setOpen(false);
    onPick(c);
  };

  return (
    <section>
      <p className={SECTION_LABEL_CLASS}>
        <span>Reference Images</span>
        <span className="normal-case tabular-nums text-[var(--swap-modal-text-secondary)]">
          {images.length}/{max}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div
            key={img.id ?? `${img.label}-${i}`}
            className="group relative h-16 w-16 overflow-hidden rounded-md border border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)]"
          >
            <img src={img.thumbUrl} alt={img.label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove reference ${img.label}`}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={capped}
              aria-label="Add reference image"
              title={capped ? `Tối đa ${max} ảnh tham khảo` : 'Add reference image'}
              className={TILE_CLASS}
            >
              <Plus className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            style={POPOVER_CONTENT_STYLE}
            className="w-64 border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-card-bg)] p-2 text-[var(--swap-modal-text-primary)]"
          >
            <button
              type="button"
              onClick={handleUploadClick}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--swap-modal-surface-hover)]"
            >
              <Upload className="h-4 w-4" />
              <span>Upload from device</span>
            </button>

            {candidates.length > 0 && (
              <>
                <div className="my-2 border-t border-[var(--swap-modal-border)]" />
                <p className="mb-1 px-2 text-[11px] uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
                  Props
                </p>
                <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto px-1 pb-1">
                  {candidates.map((c) => {
                    const picked = images.some((im) => im.id === `prop:${c.id}`);
                    const disabled = picked || capped;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={disabled}
                        aria-disabled={disabled}
                        title={c.ref}
                        onClick={() => !disabled && handlePick(c)}
                        className="relative aspect-square overflow-hidden rounded-md border border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface-hover)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <img src={c.media_url} alt={c.ref} className="h-full w-full object-cover" />
                        {picked && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <Check className="h-4 w-4 text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Hidden file input owned by the picker hook (multiple, whitelist accept). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={onFilesSelected}
      />
    </section>
  );
}
