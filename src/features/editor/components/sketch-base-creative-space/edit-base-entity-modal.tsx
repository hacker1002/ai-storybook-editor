// edit-base-entity-modal.tsx — "Edit {Character|Prop}" modal (design 04). Tabs = each base
// entity; every tab exposes TWO editable textareas. The first merges description + height +
// visual_design under labeled `[section]` headers into ONE box (the DB keeps them as separate
// fields — see base-entity-text-merge + BaseSheetEntity); the second is art_language. Deleting a
// section header makes the text unroutable, so parse errors BLOCK Save (per-field validation).
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
import { formatMergedEntityText, parseMergedEntityText } from './base-entity-text-merge';

const log = createLogger('Editor', 'EditBaseEntityModal');

/** Local editable draft for one entity's base variant. `merged` = the single labeled textarea
 *  (description + height + visual_design); `art_language` stays its own box. */
interface EntityDraft {
  merged: string;
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
      out[e.key] = {
        merged: formatMergedEntityText({
          description: base.description,
          height: base.height ?? '',
          visual_design: base.visual_design,
        }),
        art_language: base.art_language,
      };
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
          drafts[k]?.merged !== initialDrafts[k].merged ||
          drafts[k]?.art_language !== initialDrafts[k].art_language,
      ),
    [drafts, initialDrafts],
  );

  // Parse every entity's merged box so Save can gate on ALL tabs (a corrupt header on an inactive
  // tab must still block Save — otherwise its text saves to the wrong field or silently drops).
  const parsedByKey = useMemo(
    () => Object.fromEntries(Object.keys(drafts).map((k) => [k, parseMergedEntityText(drafts[k].merged)])),
    [drafts],
  );
  const invalidKeys = useMemo(
    () => Object.keys(parsedByKey).filter((k) => !parsedByKey[k].ok),
    [parsedByKey],
  );
  const activeParse = parsedByKey[activeKey];
  const activeErrors = activeParse && !activeParse.ok ? activeParse.errors : [];
  const otherInvalidKeys = invalidKeys.filter((k) => k !== activeKey);

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
      if (d.merged === init.merged && d.art_language === init.art_language) continue;
      const parsed = parseMergedEntityText(d.merged);
      if (!parsed.ok) {
        // Guarded by the disabled Save button; keep as a hard stop so we never write a bad parse.
        log.warn('handleSave', 'skip invalid entity', { kind, entityKey: key, errors: parsed.errors });
        continue;
      }
      updateSketchBaseEntityText(kind, key, {
        description: parsed.fields.description,
        height: parsed.fields.height,
        visual_design: parsed.fields.visual_design,
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
  const canSave = isDirty && invalidKeys.length === 0;

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
                    {invalidKeys.includes(key) && <span className="ml-1 text-destructive">•</span>}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visual Design
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Keep the <code>[Description]</code>, <code>[Height]</code> and <code>[Visual design]</code> headers —
                each section saves to its own field.
              </p>
              <Textarea
                className="min-h-[180px] font-mono text-sm"
                value={activeDraft.merged}
                placeholder={'[Description]\n…\n\n[Height]\n…\n\n[Visual design]\n…'}
                aria-label="Visual design (description, height, visual design)"
                aria-invalid={activeErrors.length > 0}
                onChange={(e) => updateDraft('merged', e.target.value)}
              />
              {activeErrors.length > 0 && (
                <ul className="space-y-0.5 text-xs text-destructive" role="alert">
                  {activeErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
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

            {otherInvalidKeys.length > 0 && (
              <p className="text-xs text-destructive" role="alert">
                Fix section headers on: {otherInvalidKeys.map(titleCase).join(', ')}.
              </p>
            )}
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
