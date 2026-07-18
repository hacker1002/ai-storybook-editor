// edit-stage-variant-modal.tsx — "Edit Stage — @{stageKey}/{variantKey}" modal (design 04).
// Scoped to ONE stage variant — 'base' (Base header ✏) OR non-base (row ✏), same modal. TWO
// editable textareas: visual_design + art_language — exactly the two fields that drive the
// generates (11 base / 12 variant). ⚡ NO height (stage has none — unlike the char/prop modal);
// `description` is an Excel seed and NOT edited here (partial-merge preserves it).
//
// Save ONLY writes the two fields to the store — no persist (batch-at-release): the text lands
// with the whole stage node at the held-session release-save. The variant generate's own
// flush-BEFORE reads the fresh node, so text edited and never released still reaches the AI.

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
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditStageVariantModal');

export interface EditStageVariantModalProps {
  stageKey: string;
  variantKey: string; // 'base' | non-base — same modal, same 2 fields
  onClose: () => void;
}

interface StageTextDraft {
  visual_design: string;
  art_language: string;
}

export function EditStageVariantModal({ stageKey, variantKey, onClose }: EditStageVariantModalProps) {
  const { updateSketchStageVariantText } = useSnapshotActions();
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Baseline seeded ONCE from the store (getState — non-reactive) keyed on the variant identity →
  // no re-seed per keystroke, no set-state-in-effect (React 19).
  const seed = useMemo<StageTextDraft>(() => {
    const variant = useSnapshotStore
      .getState()
      .sketch.stages.find((s) => s.key === stageKey)
      ?.variants.find((v) => v.key === variantKey);
    return {
      visual_design: variant?.visual_design ?? '',
      art_language: variant?.art_language ?? '',
    };
  }, [stageKey, variantKey]);

  const [draft, setDraft] = useState<StageTextDraft>(seed);

  const mention = `@${stageKey}/${variantKey}`;

  // Derived dirtiness (React 19: derive, never set-state-in-effect).
  const isDirty = draft.visual_design !== seed.visual_design || draft.art_language !== seed.art_language;

  const updateDraft = useCallback((field: keyof StageTextDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (isDirty) {
      log.info('handleSave', 'commit stage variant text edit', { stageKey, variantKey });
      // Partial merge — `description` intentionally omitted (Excel seed, preserved as stored).
      updateSketchStageVariantText(stageKey, variantKey, {
        visual_design: draft.visual_design,
        art_language: draft.art_language,
      });
      // No persist here — held under the stage lock, lands at the release-save.
    }
    onClose();
  }, [isDirty, stageKey, variantKey, draft, updateSketchStageVariantText, onClose]);

  const guardClose = useCallback(() => {
    if (isDirty && !window.confirm('Huỷ thay đổi chưa lưu?')) return;
    onClose();
  }, [isDirty, onClose]);

  useInteractionLayer('modal', {
    id: 'edit-stage-variant-modal',
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
          <DialogTitle>Edit Stage — {mention}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit this stage variant&rsquo;s visual design and art language.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visual Design
          </Label>
          <Textarea
            className="min-h-[180px] font-mono text-sm"
            value={draft.visual_design}
            placeholder="Describe this stage's visual design…"
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
            placeholder="Describe this stage's art language…"
            aria-label="Art language"
            onChange={(e) => updateDraft('art_language', e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={guardClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isDirty} aria-disabled={!isDirty}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
