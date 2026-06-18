// parameters-sidebar.tsx — Right sidebar (design §3.4). Generate panel (Model Select /
// Prompt + reference chips / Stage Setting grid / Edge Treatment icon grid) OR the Upload
// dropzone. Presentational/dumb — all state + handlers come from the root. No bottom CTA;
// the single action lives on the GeneratedSidebar [+] (design §3.4).

import { useCallback, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, X, Check, UploadCloud } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { useReferenceImagePicker } from '@/features/editor/hooks/use-reference-image-picker';
import {
  RIGHT_SIDEBAR_WIDTH_PX,
  Z_INDEX,
} from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';
import {
  MODEL_OPTIONS,
  EDGE_TREATMENT_OPTIONS,
  UPLOAD,
  type GenerateModalMode,
} from './generate-image-modal-constants';
import type { FlatStageVariant } from './generate-image-modal-helpers';

const log = createLogger('Editor', 'ParametersSidebar');

// Only the render-safe slice of the picker — inputRef / handleFilesSelected (the actual
// ref + change handler) are wired on the root's hidden <input>, never read in a child render.
type GenerateRefsView = Pick<
  ReturnType<typeof useReferenceImagePicker>,
  'images' | 'openPicker' | 'removeImage'
>;

interface ParametersSidebarProps {
  mode: GenerateModalMode;
  // Generate panel
  model: string;
  onModelChange: (model: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onPromptSubmit: () => void;
  generateRefs: GenerateRefsView;
  stageVariants: FlatStageVariant[];
  selectedStageVariant: string | null;
  onStageVariantSelect: (ref: string | null) => void;
  edgeTreatment: string;
  onEdgeTreatmentSelect: (value: string) => void;
  isProcessing: boolean;
  // Upload panel
  isUploading: boolean;
  onDropFiles: (files: FileList) => void;
  openUploadPicker: () => void;
}

// Radix popper copies the content's computed z onto its portal wrapper — without this the
// dropdown (shadcn default z-50) paints behind the full-screen modal (z-4000). See memory.
const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS =
  'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';

/** Minimal distinct glyph per edge-treatment value (no shared asset — KISS inline SVG). */
function EdgeIcon({ value }: { value: string }) {
  const common = { className: 'h-6 w-6', viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (value) {
    case 'faded':
      return (
        <svg {...common} fill="none">
          <defs>
            <radialGradient id="edge-faded">
              <stop offset="40%" stopColor="currentColor" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="9" fill="url(#edge-faded)" />
        </svg>
      );
    case 'cutout':
      return (
        <svg {...common} fill="currentColor">
          <path d="M5 5h14v14H5z" opacity="0.25" />
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
    case 'geometric':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
        </svg>
      );
    case 'stroke':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      );
    case 'none':
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="5" y="5" width="14" height="14" rx="2" strokeDasharray="3 2" />
        </svg>
      );
  }
}

export function ParametersSidebar(props: ParametersSidebarProps) {
  const {
    mode,
    model,
    onModelChange,
    prompt,
    onPromptChange,
    onPromptSubmit,
    generateRefs,
    stageVariants,
    selectedStageVariant,
    onStageVariantSelect,
    edgeTreatment,
    onEdgeTreatmentSelect,
    isProcessing,
    isUploading,
    onDropFiles,
    openUploadPicker,
  } = props;

  const [isDragOver, setIsDragOver] = useState(false);

  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onPromptSubmit();
      }
    },
    [onPromptSubmit],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        log.debug('handleDrop', 'files dropped on upload panel', { count: files.length });
        onDropFiles(files);
      }
    },
    [onDropFiles],
  );

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-y-auto border-l border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
      aria-label="Tham số tạo ảnh"
    >
      {mode === 'generate' ? (
        <div className="flex flex-col gap-5 px-4 py-4">
          {/* MODEL */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
              Model
            </p>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger className={DARK_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={SELECT_CONTENT_STYLE}>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* PROMPT */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
                Prompt
              </p>
              <button
                type="button"
                aria-label="Attach reference image"
                onClick={generateRefs.openPicker}
                disabled={isProcessing}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--swap-modal-text-muted)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)] disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>
            {generateRefs.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {generateRefs.images.map((img, idx) => (
                  <span
                    key={`ref-${img.label}-${idx}`}
                    className="flex items-center gap-1 rounded-md bg-[var(--swap-modal-accent-soft)] px-2 py-1 text-xs text-[var(--swap-modal-text-secondary)]"
                  >
                    <span className="max-w-[120px] truncate">{img.label}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${img.label}`}
                      onClick={() => generateRefs.removeImage(idx)}
                      className="rounded hover:text-[var(--swap-modal-text-primary)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Describe the scene…"
              disabled={isProcessing}
              className="min-h-[96px] resize-none border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-primary)] placeholder:text-[var(--swap-modal-text-muted)] focus-visible:ring-[var(--swap-modal-accent)]"
            />
            <p className="mt-1 text-[11px] text-[var(--swap-modal-text-muted)]">
              Press Ctrl/Cmd + Enter to generate
            </p>
            {/* Hidden file input lives on the root (owns the picker hook). */}
          </section>

          {/* STAGE SETTING */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
              Stage Setting
            </p>
            <div role="radiogroup" aria-label="Stage Setting" className="grid grid-cols-3 gap-2">
              {stageVariants.map((variant) => {
                const isSelected = selectedStageVariant === variant.ref;
                return (
                  <button
                    key={variant.ref ?? 'none'}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    title={variant.label}
                    onClick={() => onStageVariantSelect(variant.ref)}
                    disabled={isProcessing}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-md border-2 transition-colors disabled:opacity-40',
                      isSelected
                        ? 'border-[var(--swap-modal-accent)]'
                        : 'border-[var(--swap-modal-border)] hover:border-[var(--swap-modal-border-strong)]',
                    )}
                  >
                    {variant.thumbnail_url ? (
                      <img
                        src={variant.thumbnail_url}
                        alt={variant.label}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center break-words p-1 text-center text-[10px] leading-tight text-[var(--swap-modal-text-muted)] line-clamp-3 bg-[var(--swap-modal-card-bg)]">
                        {variant.label}
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute right-1 top-1 rounded-full bg-[var(--swap-modal-accent)] p-0.5">
                        <Check className="h-3 w-3 text-white" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* EDGE TREATMENT */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
              Edge Treatment
            </p>
            <div role="radiogroup" aria-label="Edge Treatment" className="grid grid-cols-5 gap-2">
              {EDGE_TREATMENT_OPTIONS.map((opt) => {
                const isSelected = edgeTreatment === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    title={opt.label}
                    onClick={() => onEdgeTreatmentSelect(opt.value)}
                    disabled={isProcessing}
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-center rounded-md border-2 text-[var(--swap-modal-text-secondary)] transition-colors disabled:opacity-40',
                      isSelected
                        ? 'border-[var(--swap-modal-accent)] text-[var(--swap-modal-text-primary)]'
                        : 'border-[var(--swap-modal-border)] hover:border-[var(--swap-modal-border-strong)]',
                    )}
                  >
                    <EdgeIcon value={opt.value} />
                    {isSelected && (
                      <span className="absolute right-0.5 top-0.5 rounded-full bg-[var(--swap-modal-accent)] p-0.5">
                        <Check className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 grid grid-cols-5 gap-2">
              {EDGE_TREATMENT_OPTIONS.map((opt) => (
                <span
                  key={`${opt.value}-label`}
                  className="text-center text-[10px] text-[var(--swap-modal-text-muted)]"
                >
                  {opt.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* UPLOAD panel */
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
            Upload File
          </p>
          <button
            type="button"
            onClick={openUploadPicker}
            disabled={isUploading}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 text-[var(--swap-modal-text-muted)] transition-colors disabled:opacity-40',
              isDragOver
                ? 'border-[var(--swap-modal-accent)] bg-[var(--swap-modal-accent-soft)]'
                : 'border-[var(--swap-modal-border-strong)] hover:border-[var(--swap-modal-accent)]',
            )}
          >
            <UploadCloud className="h-8 w-8" aria-hidden="true" />
            <span className="text-sm">Click or drag &amp; drop an image</span>
            <span className="text-[11px]">
              PNG, JPEG, WebP · max {UPLOAD.maxSizeMB}MB
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
