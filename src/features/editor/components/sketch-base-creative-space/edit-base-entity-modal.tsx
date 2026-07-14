// edit-base-entity-modal.tsx — "Edit {Character|Prop}" modal (design 04). Tabs = each base
// entity; every tab exposes TWO editable textareas: visual_design and art_language (the only two
// fields that drive base-sheet generation). description/height live in the DB but are NOT edited
// here — the store action is a partial merge, so leaving them out preserves their values.
// ALL entities are drafted locally; Save commits ONCE, diffing so only changed entities are
// written (updateSketchBaseEntityText). Switching tabs keeps drafts.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSketchBaseEntityKeys, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useInteractionLayer } from '@/features/editor/contexts';
import { titleCase } from '@/features/editor/components/sketch-variants-creative-space/sketch-variants-constants';
import type { BaseKind } from '@/types/sketch';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditBaseEntityModal');

/** Local editable draft for one entity's base variant — only the two generation-driving fields. */
interface EntityDraft {
  visual_design: string;
  art_language: string;
}
type DraftMap = Record<string, EntityDraft>;

export interface EditBaseEntityModalProps {
  kind: BaseKind;
  onClose: () => void;
}

export function EditBaseEntityModal({ kind, onClose }: EditBaseEntityModalProps) {
  const entityKeys = useSketchBaseEntityKeys(kind);
  const { updateSketchBaseEntityText, autoSaveSnapshot } = useSnapshotActions();
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Baseline seeded ONCE from the store (getState, not a reactive read) — the diff target on Save.
  const initialDrafts = useMemo<DraftMap>(() => {
    const out: DraftMap = {};
    for (const e of useSnapshotStore.getState().sketch[kind]) {
      const base = e.variants.find((v) => v.key === 'base');
      if (!base) continue;
      out[e.key] = { visual_design: base.visual_design, art_language: base.art_language };
    }
    return out;
  }, [kind]);

  const [drafts, setDrafts] = useState<DraftMap>(() => {
    const copy: DraftMap = {};
    for (const key of Object.keys(initialDrafts)) copy[key] = { ...initialDrafts[key] };
    return copy;
  });
  const [activeKey, setActiveKey] = useState<string>(() => entityKeys[0] ?? '');

  const cfg = kind === 'characters' ? 'Character' : 'Prop';

  // Derived dirtiness (React 19: derive, never set-state-in-effect).
  const isDirty = useMemo(
    () =>
      Object.keys(initialDrafts).some(
        (k) =>
          drafts[k]?.visual_design !== initialDrafts[k].visual_design ||
          drafts[k]?.art_language !== initialDrafts[k].art_language,
      ),
    [drafts, initialDrafts],
  );

  const updateDraft = useCallback(
    (field: keyof EntityDraft, value: string) => {
      setDrafts((prev) => ({ ...prev, [activeKey]: { ...prev[activeKey], [field]: value } }));
    },
    [activeKey],
  );

  const handleSave = useCallback(() => {
    let changed = 0;
    for (const key of Object.keys(initialDrafts)) {
      const d = drafts[key];
      const init = initialDrafts[key];
      if (d.visual_design === init.visual_design && d.art_language === init.art_language) continue;
      // Partial merge — description/height intentionally omitted so their stored values persist.
      updateSketchBaseEntityText(kind, key, {
        visual_design: d.visual_design,
        art_language: d.art_language,
      });
      changed += 1;
    }
    log.info('handleSave', 'commit base entity text edits', { kind, changed });
    // Fire-and-forget durability (base collab-lock not designed yet — self-guarded autosave).
    if (changed > 0) void autoSaveSnapshot();
    onClose();
  }, [drafts, initialDrafts, kind, updateSketchBaseEntityText, autoSaveSnapshot, onClose]);

  const guardClose = useCallback(() => {
    if (isDirty && !window.confirm('Huỷ thay đổi chưa lưu?')) return;
    onClose();
  }, [isDirty, onClose]);

  useInteractionLayer('modal', {
    id: 'edit-base-entity-modal',
    ref: modalContentRef,
    captureClickOutside: true,
    hotkeys: ['Escape'],
    onHotkey: (key) => {
      if (key === 'Escape') guardClose();
    },
    onClickOutside: guardClose,
  });

  const activeDraft = drafts[activeKey];
  const canSave = isDirty;

  return (
    <Dialog open onOpenChange={(open) => !open && guardClose()}>
      <DialogContent
        ref={modalContentRef}
        className="max-w-[560px]"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit {cfg}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit each base entity&rsquo;s visual design and art language.
          </DialogDescription>
        </DialogHeader>

        {entityKeys.length === 0 || !activeDraft ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No base {cfg.toLowerCase()} entities yet — import from Excel first.
          </p>
        ) : (
          <>
            <Tabs value={activeKey} onValueChange={setActiveKey}>
              <TabsList className="h-auto flex-wrap">
                {entityKeys.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {titleCase(key)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visual Design
              </Label>
              <Textarea
                className="min-h-[180px] font-mono text-sm"
                value={activeDraft.visual_design}
                placeholder="Describe this entity's visual design…"
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
                value={activeDraft.art_language}
                placeholder="Describe this entity's art language…"
                aria-label="Art language"
                onChange={(e) => updateDraft('art_language', e.target.value)}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={guardClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
