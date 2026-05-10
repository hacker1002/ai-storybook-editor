// item-tags-section.tsx - Shared toolbar section managing tags[] on image/video/audio/auto_pic/auto_audio items

import { useState, useMemo, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createLogger } from '@/utils/logger';
import { useCharacters } from '@/stores/snapshot-store/selectors';
import { useProps } from '@/stores/snapshot-store/selectors';
import type { SpreadTag } from '@/types/spread-types';
import {
  dedupTags,
  buildObjectOptions,
  resolveVariants,
  getTakenVariants,
  type DraftTagRow as DraftTagRowData,
  type ObjectOption,
} from './tag-utils';
import { CommittedTagRow } from './committed-tag-row';
import { DraftTagRow } from './draft-tag-row';

const log = createLogger('Editor', 'ItemTagsSection');

export interface ItemTagsSectionProps {
  value: SpreadTag[] | undefined;
  onChange: (tags: SpreadTag[]) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function ItemTagsSection({
  value,
  onChange,
  disabled,
  ariaLabel = 'Tags',
}: ItemTagsSectionProps) {
  const tags = value ?? [];
  const [draftRows, setDraftRows] = useState<DraftTagRowData[]>([]);

  const characters = useCharacters();
  const props = useProps();

  const objectOptions = useMemo(
    () => buildObjectOptions(characters, props),
    [characters, props],
  );

  // Warn once per unique dangling tuple — avoids per-render log flood under strict-mode double-render.
  // Only character/prop tags can be dangling; type='other' has no entity to resolve.
  const danglingSignature = useMemo(
    () =>
      tags
        .filter(
          (t) =>
            t.type !== 'other' &&
            resolveVariants(t.type, t.object_key, characters, props).length === 0,
        )
        .map((t) => `${t.type}|${t.object_key}`)
        .join(','),
    [tags, characters, props],
  );
  useEffect(() => {
    if (danglingSignature) {
      log.warn('danglingTags', 'tags reference missing entities', { tuples: danglingSignature });
    }
  }, [danglingSignature]);

  // === Handlers ===

  function handleAddRow() {
    log.info('handleAddRow', 'added draft row', { count: draftRows.length + 1 });
    setDraftRows((prev) => [...prev, { _draftId: crypto.randomUUID() }]);
  }

  function handlePickObjectDraft(draftId: string, opt: ObjectOption) {
    const newTag: SpreadTag = {
      type: opt.type,
      object_key: opt.object_key,
      variant_key: opt.type === 'other' ? null : 'default',
    };
    const isDuplicate = tags.some(
      (t) => t.type === newTag.type && t.object_key === newTag.object_key && t.variant_key === newTag.variant_key,
    );
    if (isDuplicate) {
      log.debug('handlePickObjectDraft', 'skip duplicate promote', { newTag });
      setDraftRows((prev) => prev.filter((r) => r._draftId !== draftId));
      return;
    }
    log.info('handlePickObjectDraft', 'promote draft to committed', { newTag });
    onChange([...tags, newTag]);
    setDraftRows((prev) => prev.filter((r) => r._draftId !== draftId));
  }

  function handlePickObjectCommitted(index: number, opt: ObjectOption) {
    log.info('handlePickObjectCommitted', 'object changed on committed row', {
      index,
      newType: opt.type,
      newKey: opt.object_key,
    });
    const newTags = tags.map((t, i) =>
      i === index
        ? {
            type: opt.type,
            object_key: opt.object_key,
            variant_key: opt.type === 'other' ? null : 'default',
          }
        : t,
    );
    onChange(dedupTags(newTags));
  }

  function handlePickVariantCommitted(index: number, variantKey: string) {
    log.info('handlePickVariantCommitted', 'variant changed', { index, variantKey });
    const newTags = tags.map((t, i) => (i === index ? { ...t, variant_key: variantKey } : t));
    onChange(dedupTags(newTags));
  }

  function handleRemoveCommitted(index: number) {
    log.info('handleRemoveCommitted', 'remove committed tag', { index });
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleRemoveDraft(draftId: string) {
    log.debug('handleRemoveDraft', 'remove draft row', { draftId });
    setDraftRows((prev) => prev.filter((r) => r._draftId !== draftId));
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1.5 p-3" aria-label={ariaLabel}>
        {/* Header */}
        <div className="flex items-center justify-between h-7">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Tags</span>
          <button
            type="button"
            aria-label="Add tag"
            onClick={handleAddRow}
            disabled={disabled}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tag rows */}
        {(tags.length > 0 || draftRows.length > 0) && (
          <ul role="list" className="flex flex-col gap-1.5">
            {tags.map((tag, index) => {
              const variants = resolveVariants(tag.type, tag.object_key, characters, props);
              // 'other' tags intentionally have no variants — not dangling, just a different shape.
              const isDangling = tag.type !== 'other' && variants.length === 0;
              const takenVariants = getTakenVariants(tags, tag.type, tag.object_key, index);
              return (
                <CommittedTagRow
                  key={`${tag.type}|${tag.object_key}|${tag.variant_key}|${index}`}
                  tag={tag}
                  index={index}
                  objectOptions={objectOptions}
                  variants={variants}
                  takenVariants={takenVariants}
                  isDangling={isDangling}
                  onPickObject={handlePickObjectCommitted}
                  onPickVariant={handlePickVariantCommitted}
                  onRemove={handleRemoveCommitted}
                  disabled={disabled}
                />
              );
            })}
            {draftRows.map((draft) => (
              <DraftTagRow
                key={draft._draftId}
                draftId={draft._draftId}
                objectOptions={objectOptions}
                onPickObject={handlePickObjectDraft}
                onRemove={handleRemoveDraft}
                disabled={disabled}
              />
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}
