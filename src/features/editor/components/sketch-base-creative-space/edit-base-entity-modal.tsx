// edit-base-entity-modal.tsx — "Edit {Character|Prop}" modal (design 04). Tabs = each base
// entity; every tab exposes TWO editable textareas: visual_design and art_language (the only two
// fields that drive base-sheet generation). description/height live in the DB but are NOT edited
// here — the store action is a partial merge, so leaving them out preserves their values.
//
// Collab (ADR-043 sketch-base — GRAIN B): entity TEXT is a per-entity node (step 1 / rtype 3
// character · 4 prop), INDEPENDENT of the sheet (rtype 11) — so this modal REUSES the variant
// helper (`resolveSketchVariantLockTarget` + `flushSketchEntityUnderLock`), NOT the base-sheet
// helper. It holds a per-ACTIVE-TAB entity lock (`useHeldResourceSession`): acquire on open, and on
// tab switch the hook releases the departing entity lock + acquires the new one (lock-on-switch).
// Textareas are disabled while NOT held (acquiring / peer-blocked); a peer-held tab shows a 🔒 badge
// + banner. Drafts are LOCAL until Save (static `initialDrafts` baseline → clean discard + no peer-
// clobber of untouched tabs). Save commits every changed draft + flushes each changed entity through
// the gateway (peer-held → skip + warn), driving its OWN Saving…→Saved (`manageHeaderStatus:false` —
// a transient modal must not flip the shared header on every tab switch).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  useResourceLockStore,
  useIsLockedByOther,
  useLockHolderName,
  type LockTarget,
  type SavePayload,
} from '@/stores/resource-lock-store';
import {
  resolveSketchVariantLockTarget,
  buildSketchEntityPayload,
  flushSketchEntityUnderLock,
} from '@/stores/snapshot-store/slices/collab-sketch-variant-save-helper';
import { useHeldResourceSession } from '@/features/editor/hooks/use-held-resource-session';
import { useEditSessionStatusStore } from '@/stores/edit-session-status-store';
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
  // Static (NOT reactive) so a peer's edit to an untouched entity never makes it look dirty (which
  // would clobber the peer on Save), and so discard-on-close only drops MY local edits.
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

  // ── Per-active-tab held ENTITY session (grain B, rtype 3/4) ───────────────────────────────────
  // Target = the active tab's entity; switching tabs release-then-acquires (the hook keys on the
  // STRING target). Persistence is NOT via this session's save (drafts are uncommitted until Save)
  // — the hold is for PEER-LOCK visibility + textarea gating. A null buildPayload is not allowed, so
  // getNode/buildPayload are wired but the release-save is a no-op (store unchanged until Save).
  const lockTarget = useMemo<LockTarget | null>(
    () => (activeKey ? resolveSketchVariantLockTarget(kind, activeKey) : null),
    [kind, activeKey],
  );
  const getNode = useCallback(
    () =>
      activeKey
        ? (useSnapshotStore.getState().sketch[kind].find((e) => e.key === activeKey) ?? null)
        : null,
    [kind, activeKey],
  );
  const buildPayload = useCallback((node: unknown): SavePayload => buildSketchEntityPayload(node), []);
  const handleBlocked = useCallback((holder: string) => {
    log.info('handleBlocked', 'entity held by another editor — read-only tab', { hasHolder: !!holder });
  }, []);
  const handleLost = useCallback(() => {
    log.warn('handleLost', 'entity lock lost mid-edit');
    toast.warning('You lost the edit lock for this entity — your last change may not have saved.');
  }, []);

  const session = useHeldResourceSession({
    target: lockTarget,
    getNode,
    ownedKeys: undefined, // whole entity node
    buildPayload,
    manageHeaderStatus: false, // transient modal — drives its own Saving…→Saved on Save (below)
    onBlocked: handleBlocked,
    onLost: handleLost,
  });
  const held = session.status === 'held';
  const blocked = session.status === 'blocked';

  // Derived dirtiness vs the STATIC baseline (React 19: derive, never set-state-in-effect).
  const changedKeys = useMemo(
    () =>
      Object.keys(initialDrafts).filter(
        (k) =>
          drafts[k]?.visual_design !== initialDrafts[k].visual_design ||
          drafts[k]?.art_language !== initialDrafts[k].art_language,
      ),
    [drafts, initialDrafts],
  );
  const isDirty = changedKeys.length > 0;

  const updateDraft = useCallback(
    (field: keyof EntityDraft, value: string) => {
      setDrafts((prev) => ({ ...prev, [activeKey]: { ...prev[activeKey], [field]: value } }));
    },
    [activeKey],
  );

  // Switch tab = browse the drafts (no commit): the held session releases the old entity lock +
  // acquires the new (lock-on-switch). Local drafts persist across switches; they land only on Save.
  const handleSelectTab = useCallback((newKey: string) => {
    setActiveKey(newKey);
  }, []);

  const handleSave = useCallback(async () => {
    const keys = changedKeys;
    for (const key of keys) {
      const d = drafts[key];
      // Partial merge — description/height intentionally omitted so their stored values persist.
      updateSketchBaseEntityText(kind, key, { visual_design: d.visual_design, art_language: d.art_language });
    }
    log.info('handleSave', 'commit base entity text edits', { kind, changed: keys.length });
    if (useResourceLockStore.getState().collabPersist) {
      // Grain B: flush each CHANGED entity node (rtype 3/4) through the gateway. Peer-held → 409 →
      // skip + warn (flush toasts). One-shot (releaseIfAcquired) so no entity lock lingers.
      const ess = useEditSessionStatusStore.getState();
      if (keys.length > 0) ess.markSaving();
      try {
        for (const key of keys) {
          const node = useSnapshotStore.getState().sketch[kind].find((e) => e.key === key) ?? null;
          await flushSketchEntityUnderLock(kind, key, node, { releaseIfAcquired: true });
        }
      } finally {
        if (keys.length > 0) ess.markSaved();
      }
    } else if (keys.length > 0) {
      void autoSaveSnapshot();
    }
    onClose();
  }, [changedKeys, drafts, kind, updateSketchBaseEntityText, autoSaveSnapshot, onClose]);

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
            <Tabs value={activeKey} onValueChange={handleSelectTab}>
              <TabsList className="h-auto flex-wrap">
                {entityKeys.map((key) => (
                  <EntityTabTrigger key={key} kind={kind} entityKey={key} />
                ))}
              </TabsList>
            </Tabs>

            {/* Peer-held active tab → advisory banner (textareas are also disabled). */}
            {blocked && (
              <div
                className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground"
                role="status"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Another editor is editing {titleCase(activeKey)} — your changes here won&rsquo;t be saved.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visual Design
              </Label>
              <Textarea
                className="min-h-[180px] font-mono text-sm"
                value={activeDraft.visual_design}
                placeholder="Describe this entity's visual design…"
                aria-label="Visual design"
                disabled={!held}
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
                disabled={!held}
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

/** One entity tab trigger — self-reads its ENTITY peer-lock (rtype 3/4) so a peer-held tab shows a
 *  🔒 badge (never hidden; the tab stays selectable to view). Advisory — the acquire 409 rules. */
function EntityTabTrigger({ kind, entityKey }: { kind: BaseKind; entityKey: string }) {
  const target = useMemo(() => resolveSketchVariantLockTarget(kind, entityKey), [kind, entityKey]);
  const lockedByOther = useIsLockedByOther(target);
  const holder = useLockHolderName(target);
  return (
    <TabsTrigger value={entityKey}>
      <span
        className="flex items-center gap-1"
        title={lockedByOther ? `${holder ?? 'Another editor'} is editing` : undefined}
      >
        {titleCase(entityKey)}
        {lockedByOther && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </span>
    </TabsTrigger>
  );
}
