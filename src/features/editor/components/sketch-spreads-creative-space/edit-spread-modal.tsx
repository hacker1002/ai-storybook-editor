// edit-spread-modal.tsx — art-direction editor for a spread's pages.
// Draft is local (seeded once from the store); committed on Save. Mirrors the
// draft-local + commit-on-save pattern of sibling edit-variant-modal.tsx.
// Only art_direction is edited here — narration/textboxes live on the canvas.

import { useMemo, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useSketchEntities,
  useSketchSpreadById,
  useSnapshotActions,
} from '@/stores/snapshot-store/selectors';
import type { ArtDirection, SketchPageType, SketchSpread } from '@/types/sketch';
import { AD_FIELD_ORDER, AD_KEYS, AD_LABELS, PAGE_LABELS } from './edit-spread-modal.constants';
import { CANVAS_CONFIRM_DIALOG_Z, CANVAS_DIALOG_POPOVER_Z } from '@/constants/spread-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'EditSpreadModal');

export interface EditSpreadModalProps {
  spreadId: string;
  onClose: () => void;
}

// Draft shape: one full ArtDirection per present page type (keyed by SketchPage.type,
// which is the page's identity — pages have no id).
type ArtDirectionDraft = Partial<Record<SketchPageType, ArtDirection>>;

/** Fill all 13 fields, seeding any missing field to '' so every field renders. */
function seedArtDirection(source: ArtDirection | undefined): ArtDirection {
  const seeded = {} as ArtDirection;
  for (const key of AD_KEYS) seeded[key] = source?.[key] ?? '';
  return seeded;
}

/** Seed one draft ArtDirection per page from the spread's stored art_direction. */
function initDraft(spread: SketchSpread | undefined): ArtDirectionDraft {
  const draft: ArtDirectionDraft = {};
  for (const page of spread?.pages ?? []) {
    draft[page.type] = seedArtDirection(page.art_direction);
  }
  return draft;
}

interface LabeledTextareaProps {
  fieldKey: keyof ArtDirection;
  pageType: SketchPageType;
  value: string;
  onChange: (value: string) => void;
}

/** Reusable label-over-textarea for one art-direction field. */
function LabeledTextarea({ fieldKey, pageType, value, onChange }: LabeledTextareaProps) {
  const label = AD_LABELS[fieldKey];
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        className="min-h-[64px] text-sm resize-y"
        value={value}
        placeholder={`Describe ${label.toLowerCase()}…`}
        aria-label={`${label} — ${PAGE_LABELS[pageType]}`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Sentinel for the "no stage" option — Radix SelectItem forbids an empty-string value,
// so map it to '' on change and back to placeholder (undefined) when the draft is empty.
const STAGE_NONE_VALUE = '__none__';

interface StageSelectProps {
  pageType: SketchPageType;
  value: string;
  onChange: (value: string) => void;
}

/** `stage` art-direction field as a dropdown of `@{key}/{variant}` refs sourced from the
 *  sketch stage entities. A non-empty current value is always kept in the option list so a
 *  legacy / externally-set ref still displays even if its entity/variant was removed. The
 *  dropdown portals to body → its z must clear the canvas-lifted dialog (CANVAS_DIALOG_POPOVER_Z),
 *  else it paints behind the modal. */
function StageSelect({ pageType, value, onChange }: StageSelectProps) {
  const stages = useSketchEntities('stages');
  const label = AD_LABELS.stage;
  const options = useMemo(() => {
    const refs = stages.flatMap((entity) =>
      entity.variants.map((variant) => `@${entity.key}/${variant.key}`),
    );
    if (value && !refs.includes(value)) refs.unshift(value);
    return refs;
  }, [stages, value]);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value === '' ? undefined : value}
        onValueChange={(next) => onChange(next === STAGE_NONE_VALUE ? '' : next)}
      >
        <SelectTrigger className="text-sm" aria-label={`${label} — ${PAGE_LABELS[pageType]}`}>
          <SelectValue placeholder="Select a stage…" />
        </SelectTrigger>
        <SelectContent style={{ zIndex: CANVAS_DIALOG_POPOVER_Z }}>
          <SelectItem value={STAGE_NONE_VALUE}>— None —</SelectItem>
          {options.map((ref) => (
            <SelectItem key={ref} value={ref}>
              {ref}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ArtDirectionFieldsProps {
  pageType: SketchPageType;
  value: ArtDirection;
  onFieldChange: (key: keyof ArtDirection, value: string) => void;
}

/** Single-column stack (one field per row) of the editable art-direction fields for a page.
 *  `stage` renders as a dropdown; the rest as textareas. */
function ArtDirectionFields({ pageType, value, onFieldChange }: ArtDirectionFieldsProps) {
  return (
    <div className="space-y-3">
      {AD_FIELD_ORDER.map((key) =>
        key === 'stage' ? (
          <StageSelect
            key={key}
            pageType={pageType}
            value={value.stage ?? ''}
            onChange={(next) => onFieldChange('stage', next)}
          />
        ) : (
          <LabeledTextarea
            key={key}
            fieldKey={key}
            pageType={pageType}
            value={value[key] ?? ''}
            onChange={(next) => onFieldChange(key, next)}
          />
        ),
      )}
    </div>
  );
}

export function EditSpreadModal({ spreadId, onClose }: EditSpreadModalProps) {
  const spread = useSketchSpreadById(spreadId);
  const { updateSketchPageArtDirection } = useSnapshotActions();

  // Seed draft once from the store (lazy init — no effect/setState in render).
  const [draft, setDraft] = useState<ArtDirectionDraft>(() => initDraft(spread));
  const [activeTab, setActiveTab] = useState<SketchPageType>(() => spread?.pages[0]?.type ?? 'left');

  // Deleted while open → render null (no effect/setState loop). Root gates on editingId.
  if (!spread || spread.pages.length === 0) {
    log.debug('render', 'spread missing or empty — render null', { spreadId });
    return null;
  }

  const hasTabs = spread.pages.length > 1;

  const handleFieldChange = (
    pageType: SketchPageType,
    key: keyof ArtDirection,
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      [pageType]: { ...seedArtDirection(prev[pageType]), [key]: value },
    }));
  };

  const handleSave = () => {
    let changedPages = 0;
    for (const page of spread.pages) {
      const draftAd = draft[page.type];
      if (!draftAd) continue;
      // Count changed keys (draft ↔ store) for logging; commit whole draft if any differ.
      let changedKeys = 0;
      for (const key of AD_KEYS) {
        if ((draftAd[key] ?? '') !== (page.art_direction[key] ?? '')) changedKeys += 1;
      }
      log.debug('handleSave', 'page diff', { pageType: page.type, changedKeys });
      if (changedKeys > 0) {
        updateSketchPageArtDirection(spreadId, page.type, draftAd);
        changedPages += 1;
      }
    }
    log.info('handleSave', 'commit art direction', {
      spreadId,
      pageCount: spread.pages.length,
      changedPages,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        zIndex={CANVAS_CONFIRM_DIALOG_Z}
        className="min-w-[720px] max-w-[60vw] max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Edit spread — art direction</DialogTitle>
          <DialogDescription>
            Set the art-direction fields for each page. Changes apply on Save.
          </DialogDescription>
        </DialogHeader>

        {hasTabs ? (
          <Tabs
            value={activeTab}
            onValueChange={(next) => setActiveTab(next as SketchPageType)}
            className="mt-2"
          >
            <TabsList>
              {spread.pages.map((page) => (
                <TabsTrigger key={page.type} value={page.type}>
                  {PAGE_LABELS[page.type]}
                </TabsTrigger>
              ))}
            </TabsList>

            {spread.pages.map((page) => (
              <TabsContent key={page.type} value={page.type} className="mt-4">
                <ArtDirectionFields
                  pageType={page.type}
                  value={seedArtDirection(draft[page.type])}
                  onFieldChange={(key, value) => handleFieldChange(page.type, key, value)}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="mt-4">
            <ArtDirectionFields
              pageType={spread.pages[0].type}
              value={seedArtDirection(draft[spread.pages[0].type])}
              onFieldChange={(key, value) =>
                handleFieldChange(spread.pages[0].type, key, value)
              }
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
