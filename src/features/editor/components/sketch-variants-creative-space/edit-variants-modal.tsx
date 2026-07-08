// edit-variants-modal.tsx — Dialog to edit an entity's variant descriptions.
// Draft is local; committed on Save (one upsertSketchVariant per variant). Add-only:
// variant keys are the `@key/variant` identity (read-only) and cannot be removed here.

import { useMemo, useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSketchEntityByKey, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useResourceLockSession } from '@/features/editor/hooks/use-resource-lock-session';
import { type LockTarget } from '@/stores/resource-lock-store';
import type { SketchEntity, SketchEntityKind, SketchVariant } from '@/types/sketch';
import { KIND_TO_RESOURCE_TYPE, titleCase } from './sketch-variants-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditVariantsModal');

const VARIANT_KEY_RE = /^[a-z0-9_]+$/;

interface EditVariantsModalProps {
  kind: SketchEntityKind;
  entityKey: string;
  onClose: () => void;
}

interface VariantKeyInputProps {
  existingKeys: string[];
  onConfirm: (key: string) => void;
  onCancel: () => void;
}

/** Inline add-variant input: validates unique + `^[a-z0-9_]+$` before confirm. */
function VariantKeyInput({ existingKeys, onConfirm, onCancel }: VariantKeyInputProps) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const isValidFormat = VARIANT_KEY_RE.test(trimmed);
  const isDuplicate = existingKeys.includes(trimmed);
  const canConfirm = trimmed.length > 0 && isValidFormat && !isDuplicate;
  const error =
    trimmed.length === 0
      ? null
      : !isValidFormat
        ? 'Use a–z, 0–9, _ only'
        : isDuplicate
          ? 'Variant key already exists'
          : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          className="h-7 text-sm w-32"
          value={value}
          placeholder="variant_key"
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm(trimmed);
            if (e.key === 'Escape') onCancel();
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          disabled={!canConfirm}
          onClick={() => onConfirm(trimmed)}
          aria-label="Confirm variant key"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onCancel}
          aria-label="Cancel add variant"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function EditVariantsModal({ kind, entityKey, onClose }: EditVariantsModalProps) {
  const entity = useSketchEntityByKey(kind, entityKey);
  const { upsertSketchVariant, upsertSketchEntity } = useSnapshotActions();

  // Edit-lock session: opening this modal IS the entity edit-session. The hook is the
  // single owner of acquire → baseline snapshot → heartbeat → release-and-save-if-dirty.
  // Target is language-agnostic (locale: null); resource_type per kind (3/4/5).
  const lockTarget = useMemo<LockTarget>(
    () => ({ step: 1, resource_type: KIND_TO_RESOURCE_TYPE[kind], resource_id: entityKey, locale: null }),
    [kind, entityKey],
  );
  const { status } = useResourceLockSession({
    target: lockTarget,
    // Live (non-reactive) read: baseline is snapshotted at acquire, dirty-diffed at
    // release. Reading getState() (not the render-captured `entity`) guarantees the
    // release-time node reflects a just-committed Save even without a re-render.
    getNode: () => useSnapshotStore.getState().sketch[kind].find((e) => e.key === entityKey) ?? null,
    buildPayload: (node) => ({
      action_type: 3, // edit
      patch: node,
      target_ref: { kind, entity: entityKey },
    }),
    onBlocked: (holder) => {
      log.warn('onBlocked', 'entity held by another editor — close', { kind, entityKey, hasHolder: !!holder });
      toast.error(`${holder || 'another editor'} đang sửa`);
      onClose();
    },
    onLost: (baseline) => {
      log.warn('onLost', 'lock lost mid-edit — revert entity + close', { kind, entityKey });
      if (baseline) upsertSketchEntity(kind, baseline as SketchEntity);
      toast.error('Bạn đã mất quyền khoá — thay đổi đã được hoàn tác');
      onClose();
    },
  });
  // Guard the fast-Save race: baseline is only captured once the lock is 'held'. If Save
  // committed before that, release cleanup would see key ∉ myLocks and skip the save.
  const canSave = status === 'held';

  // Seed draft once from the store. Empty entity → one blank `base` tab.
  const [draft, setDraft] = useState<SketchVariant[]>(() => {
    const variants = entity?.variants ?? [];
    return variants.length > 0
      ? variants.map((v) => ({ ...v }))
      : [{ key: 'base', visual_description: '' }];
  });
  const [activeKey, setActiveKey] = useState<string>(() => draft[0]?.key ?? 'base');
  const [isAdding, setIsAdding] = useState(false);

  const draftKeys = useMemo(() => draft.map((v) => v.key), [draft]);
  const name = titleCase(entityKey);

  const handleDescriptionChange = (variantKey: string, description: string) => {
    setDraft((prev) =>
      prev.map((v) => (v.key === variantKey ? { ...v, visual_description: description } : v)),
    );
  };

  const handleAddVariant = (newKey: string) => {
    log.debug('handleAddVariant', 'add draft variant', { entityKey, newKey });
    setDraft((prev) => [...prev, { key: newKey, visual_description: '' }]);
    setActiveKey(newKey);
    setIsAdding(false);
  };

  const handleSave = () => {
    log.info('handleSave', 'commit variants', { kind, entityKey, count: draft.length });
    for (const variant of draft) {
      upsertSketchVariant(kind, entityKey, variant);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit variants — {name}</DialogTitle>
          <DialogDescription>
            Edit each variant&rsquo;s visual description. Variant keys are read-only (they
            form the <code>@{entityKey}/&lt;variant&gt;</code> reference).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeKey} onValueChange={setActiveKey} className="mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList className="flex-wrap h-auto">
              {draft.map((v) => (
                <TabsTrigger key={v.key} value={v.key}>
                  {v.key}
                </TabsTrigger>
              ))}
            </TabsList>
            {isAdding ? (
              <VariantKeyInput
                existingKeys={draftKeys}
                onConfirm={handleAddVariant}
                onCancel={() => setIsAdding(false)}
              />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsAdding(true)}
                aria-label="Add variant"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          {draft.map((v) => (
            <TabsContent key={v.key} value={v.key} className="mt-3 space-y-2">
              <Label className="text-xs text-muted-foreground">
                @{entityKey}/{v.key}
              </Label>
              <Textarea
                className="min-h-[160px] text-sm"
                value={v.visual_description}
                placeholder="Describe this variant's appearance…"
                onChange={(e) => handleDescriptionChange(v.key, e.target.value)}
              />
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            title={canSave ? undefined : 'Đang thiết lập quyền khoá…'}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
