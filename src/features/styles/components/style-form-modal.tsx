// style-form-modal.tsx — Shared create/edit modal for one art-style.
// Eager image upload (file → Storage immediately → thumbnail); submit only
// writes the DB row (URLs already resolved). `mode` differentiates title/CTA/init.

import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  insertStyle,
  removeStyleImage,
  updateStyle,
  uploadStyleImage,
} from '@/apis/style-api';
import { mapStyleRow, toStyleRow } from '@/features/styles/utils/style-mapper';
import { MAX_STYLE_IMG_BYTES, REF_CAP } from '@/features/styles/constants/constants';

// Mirror the API allowlist (style-api uploadStyleImage) for consistent UX:
// reject SVG/avif/etc. before upload with a specific toast.
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
import type { ArtStyle, FormMode, StyleImageReference } from '@/types/art-style';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Styles', 'StyleFormModal');

type StyleFormMode = Exclude<FormMode, null>; // 'create' | 'edit'

interface StyleFormDraft {
  id: string;
  name: string;
  tags: string; // raw comma-separated TEXT
  description: string;
  imageReferences: StyleImageReference[];
}

interface StyleFormModalProps {
  mode: StyleFormMode;
  style: ArtStyle | null;
  onClose: () => void;
  onSaved: (style: ArtStyle) => void;
}

interface ReferenceImagesFieldProps {
  images: StyleImageReference[];
  cap: number;
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onRemove: (index: number) => void;
}

function genUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build the initial draft: create → empty + fresh id; edit → mapped from style. */
function initDraft(mode: StyleFormMode, style: ArtStyle | null): StyleFormDraft {
  if (mode === 'edit' && style) {
    return {
      id: style.id,
      name: style.name,
      tags: style.tags,
      description: style.description,
      imageReferences: [...style.imageReferences],
    };
  }
  return { id: genUuid(), name: '', tags: '', description: '', imageReferences: [] };
}

/** trim + lowercase + dedupe comma tags, re-joined as ", " (raw TEXT for DB). */
function normalizeTags(raw: string): string {
  const arr = [
    ...new Set(
      raw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return arr.join(', ');
}

/** Inline reference-images grid: thumbnails (✕ on hover) + dashed UploadTile. */
function ReferenceImagesField({
  images,
  cap,
  uploading,
  onUpload,
  onRemove,
}: ReferenceImagesFieldProps) {
  const atCap = images.length >= cap;

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) onUpload(files);
    e.target.value = '';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((ref, idx) => (
        <div
          key={`${ref.mediaUrl}-${idx}`}
          className="group relative size-20 overflow-hidden rounded-md border border-border"
        >
          <img
            src={ref.mediaUrl}
            alt={ref.title}
            className="size-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            disabled={uploading}
            aria-label="Remove image"
            className="absolute right-1 top-1 hidden size-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground backdrop-blur hover:bg-destructive hover:text-destructive-foreground group-hover:inline-flex"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={cn(
                'flex size-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-muted-foreground',
                atCap || uploading
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:border-primary hover:bg-accent',
              )}
            >
              <Upload className="size-5" />
              <span className="text-xs">{uploading ? 'Uploading…' : 'Upload'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={atCap || uploading}
                onChange={handlePick}
                aria-label="Upload reference image"
              />
            </label>
          </TooltipTrigger>
          {atCap ? (
            <TooltipContent>Max {cap} reference images</TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function StyleFormModal({
  mode,
  style,
  onClose,
  onSaved,
}: StyleFormModalProps) {
  const [draft, setDraft] = useState<StyleFormDraft>(() => initDraft(mode, style));
  const [step, setStep] = useState<'idle' | 'saving'>('idle');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode: URLs already persisted in the DB row at open. Removing one then
  // hitting Cancel must NOT hard-delete Storage (would dangle the DB pointer) —
  // defer those deletions to a successful Save. `useRef` so it stays stable
  // across renders; .current is only read/written inside handlers (never in
  // render body — React 19 lints ref-in-render as an error).
  const originalRefUrls = useRef<Set<string>>(
    new Set(
      mode === 'edit' && style
        ? style.imageReferences.map((ref) => ref.mediaUrl)
        : [],
    ),
  );
  // Refs uploaded during THIS modal session: their ✕ hard-deletes immediately
  // (orphan cleanup), preserving the accepted orphan-on-cancel-for-new behavior.
  const uploadedThisSession = useRef<Set<string>>(new Set());

  const title = mode === 'create' ? 'New Style' : 'Edit Style';
  const cta = mode === 'create' ? 'Create Style' : 'Save Changes';
  const nameValid = draft.name.trim().length >= 1;
  const saving = step === 'saving';

  const setField = (field: keyof StyleFormDraft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  /** Validate type/size client-side, then eager-upload each (cap at REF_CAP). */
  const handleUploadFiles = async (files: FileList) => {
    const remaining = Math.max(0, REF_CAP - draft.imageReferences.length);
    if (remaining <= 0) {
      log.debug('handleUploadFiles', 'skip: at cap', { id: draft.id });
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    log.info('handleUploadFiles', 'start', { id: draft.id, count: picked.length });
    setUploading(true);
    setError(null);

    for (const file of picked) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        log.warn('handleUploadFiles', 'skip: unsupported type', {
          id: draft.id,
          type: file.type,
        });
        toast.error(`"${file.name}" is not a supported image (use JPG, PNG, or WebP).`);
        continue;
      }
      if (file.size > MAX_STYLE_IMG_BYTES) {
        log.warn('handleUploadFiles', 'skip: too large', { id: draft.id });
        toast.error(`"${file.name}" is too large (max 10MB).`);
        continue;
      }
      try {
        const ref = await uploadStyleImage(draft.id, file);
        uploadedThisSession.current.add(ref.mediaUrl);
        setDraft((d) => ({ ...d, imageReferences: [...d.imageReferences, ref] }));
        log.debug('handleUploadFiles', 'uploaded one', { id: draft.id });
      } catch (e) {
        log.error('handleUploadFiles', 'upload failed', {
          id: draft.id,
          error: String(e),
        });
        toast.error(`Failed to upload "${file.name}".`);
      }
    }

    setUploading(false);
    log.info('handleUploadFiles', 'done', { id: draft.id });
  };

  /**
   * Remove a reference from the local draft. Hard-delete Storage NOW only for
   * refs uploaded this session (would orphan otherwise); defer deletion of
   * originally-persisted refs to a successful Save (avoids dangling the DB
   * pointer if the user then Cancels).
   */
  const handleRemoveRef = (index: number) => {
    const target = draft.imageReferences[index];
    setDraft((d) => ({
      ...d,
      imageReferences: d.imageReferences.filter((_, i) => i !== index),
    }));
    if (!target) return;

    if (uploadedThisSession.current.has(target.mediaUrl)) {
      uploadedThisSession.current.delete(target.mediaUrl);
      log.debug('handleRemoveRef', 'remove session upload (delete now)', {
        id: draft.id,
        index,
      });
      void removeStyleImage(target.mediaUrl).catch(() => undefined);
    } else {
      // Originally-persisted ref → drop from draft only; defer Storage delete.
      log.debug('handleRemoveRef', 'remove original (defer delete)', {
        id: draft.id,
        index,
      });
    }
  };

  const handleSubmit = async () => {
    if (!nameValid) {
      log.debug('handleSubmit', 'blocked: name required', { id: draft.id });
      setError('Name is required.');
      return;
    }
    log.info('handleSubmit', 'start', { id: draft.id, mode });
    setStep('saving');
    setError(null);

    const row = toStyleRow({
      id: draft.id,
      name: draft.name.trim(),
      tags: normalizeTags(draft.tags),
      description: draft.description.trim(),
      imageReferences: draft.imageReferences,
    });

    try {
      const saved =
        mode === 'create'
          ? await insertStyle(row)
          : await updateStyle(draft.id, row);
      if (!saved) throw new Error('write returned no row');

      // Edit mode: the row now persists the final ref set, so any originally
      // persisted ref that's no longer present is safe to delete from Storage.
      // Fire-and-forget, best-effort (owner-only storage may no-op).
      if (mode === 'edit') {
        const finalUrls = new Set(draft.imageReferences.map((ref) => ref.mediaUrl));
        const toDelete = [...originalRefUrls.current].filter(
          (url) => !finalUrls.has(url),
        );
        if (toDelete.length > 0) {
          log.info('handleSubmit', 'deferred ref cleanup', {
            id: draft.id,
            count: toDelete.length,
          });
          for (const url of toDelete) {
            void removeStyleImage(url).catch(() => undefined);
          }
        }
      }

      log.info('handleSubmit', 'success', { id: draft.id, mode });
      onSaved(mapStyleRow(saved));
      onClose();
    } catch (e) {
      log.error('handleSubmit', 'failed', { id: draft.id, mode, error: String(e) });
      setError('Failed to save style. Please try again.');
      setStep('idle');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (saving) return; // block dismiss mid-save
    onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {mode === 'create'
              ? 'Create a new art style.'
              : 'Edit this art style.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label
              htmlFor="style-name"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Name
            </Label>
            <Input
              id="style-name"
              autoFocus
              value={draft.name}
              placeholder="e.g., Watercolor Storybook"
              onChange={(e) => setField('name', e.target.value)}
              disabled={saving}
              aria-invalid={!nameValid}
            />
          </div>

          <div>
            <Label
              htmlFor="style-tags"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Tags
            </Label>
            <Input
              id="style-tags"
              value={draft.tags}
              placeholder="e.g., watercolor, soft, storybook (comma separated)"
              onChange={(e) => setField('tags', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label
              htmlFor="style-description"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Description
            </Label>
            <Textarea
              id="style-description"
              className="min-h-24"
              value={draft.description}
              placeholder="Describe the visual style..."
              onChange={(e) => setField('description', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reference Images
            </Label>
            <div className="mt-2">
              <ReferenceImagesField
                images={draft.imageReferences}
                cap={REF_CAP}
                uploading={uploading}
                onUpload={handleUploadFiles}
                onRemove={handleRemoveRef}
              />
            </div>
          </div>

          {error ? (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || uploading || !nameValid}
          >
            {saving ? 'Saving...' : cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
