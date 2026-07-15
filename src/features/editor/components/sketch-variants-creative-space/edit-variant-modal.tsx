// edit-variant-modal.tsx — "Edit Variant — @{entityKey}/{variantKey}" modal (design 03). Scoped to
// ONE non-base variant (NO entity tabs — unlike the base modal). Exactly TWO editable textareas:
// visual_design + art_language — the only two fields the variant endpoints (08/09) use to build the
// prompt. description/height live in the DB but are NOT edited here (the store action is a partial
// merge, so leaving them out preserves their values).
//
// Save writes the two fields then persists via the parent (`onSaved`, fire-and-forget) BECAUSE the
// generate endpoint reads snapshot.sketch from the DB (snapshot-reading) — text must land before the
// user hits ✨. Under collab (ADR-047) the parent routes `onSaved` through the held-session saveNow
// (whole entity node, keeps the lock); under solo it falls back to autoSaveSnapshot. This modal no
// longer calls autoSaveSnapshot directly (it is suppressed under collab → would silently no-op).

import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useInteractionLayer } from '@/features/editor/contexts';
import type { BaseKind } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditVariantModal');

export interface EditVariantModalProps {
  kind: BaseKind;
  entityKey: string;
  variantKey: string; // non-base
  /** Persist the WHOLE entity node after a dirty save (parent routes collab saveNow / solo autosave). */
  onSaved: () => void;
  onClose: () => void;
}

interface VariantTextDraft {
  visual_design: string;
  art_language: string;
}

export function EditVariantModal({ kind, entityKey, variantKey, onSaved, onClose }: EditVariantModalProps) {
  const { updateSketchVariantText } = useSnapshotActions();
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Baseline seeded ONCE from the store (getState — non-reactive read; mirrors edit-base-entity-modal)
  // keyed on the variant identity → no re-seed on every keystroke, no set-state-in-effect (React 19).
  const seed = useMemo<VariantTextDraft>(() => {
    const variant = useSnapshotStore
      .getState()
      .sketch[kind].find((e) => e.key === entityKey)
      ?.variants.find((v) => v.key === variantKey);
    return {
      visual_design: variant?.visual_design ?? '',
      art_language: variant?.art_language ?? '',
    };
  }, [kind, entityKey, variantKey]);

  const [draft, setDraft] = useState<VariantTextDraft>(seed);

  const mention = `@${entityKey}/${variantKey}`;

  // Derived dirtiness (React 19: derive, never set-state-in-effect).
  const isDirty =
    draft.visual_design !== seed.visual_design || draft.art_language !== seed.art_language;

  const updateDraft = useCallback((field: keyof VariantTextDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (isDirty) {
      log.info('handleSave', 'commit variant text edit', { kind, entityKey, variantKey });
      // Partial merge — description/height intentionally omitted so their stored values persist.
      updateSketchVariantText(kind, entityKey, variantKey, {
        visual_design: draft.visual_design,
        art_language: draft.art_language,
      });
      // Persist the WHOLE entity node BEFORE generate — the endpoint reads snapshot.sketch
      // (snapshot-reading). Parent routes collab saveNow (held lock) / solo autosave. Fire-and-forget.
      onSaved();
    }
    onClose();
  }, [isDirty, kind, entityKey, variantKey, draft, updateSketchVariantText, onSaved, onClose]);

  const guardClose = useCallback(() => {
    if (isDirty && !window.confirm('Huỷ thay đổi chưa lưu?')) return;
    onClose();
  }, [isDirty, onClose]);

  useInteractionLayer('modal', {
    id: 'edit-variant-modal',
    ref: modalContentRef,
    captureClickOutside: true,
    hotkeys: ['Escape'],
    onHotkey: (key) => {
      if (key === 'Escape') guardClose();
    },
    onClickOutside: guardClose,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && guardClose()}>
      <DialogContent
        ref={modalContentRef}
        className="max-w-[560px]"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Variant — {mention}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit this variant&rsquo;s visual design and art language.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visual Design
          </Label>
          <Textarea
            className="min-h-[180px] font-mono text-sm"
            value={draft.visual_design}
            placeholder="Describe this variant's visual design…"
            aria-label="Visual design"
            onChange={(e) => updateDraft('visual_design', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Art Language
          </Label>
          <Textarea
            className="min-h-[96px] text-sm"
            value={draft.art_language}
            placeholder="Describe this variant's art language…"
            aria-label="Art language"
            onChange={(e) => updateDraft('art_language', e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={guardClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isDirty}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
