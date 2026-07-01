// edit-spread-modal.tsx — art-direction editor for a spread's pages.
// Draft is local (seeded once from the store); committed on Save. Mirrors the
// draft-local + commit-on-save pattern of sibling edit-variants-modal.tsx.
// Only art_direction is edited here — narration/textboxes live on the canvas.

import { useState } from 'react';
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
import { useSketchSpreadById, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import type { ArtDirection, SketchPageType, SketchSpread } from '@/types/sketch';
import { AD_FIELD_LAYOUT, AD_KEYS, AD_LABELS, PAGE_LABELS } from './edit-spread-modal.constants';
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
  // `stage` holds verbatim `@key/variant` reference text — plain textarea, no resolution.
  const placeholder =
    fieldKey === 'stage' ? 'e.g. @forest/night' : `Describe ${label.toLowerCase()}…`;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        className="min-h-[64px] text-sm resize-y"
        value={value}
        placeholder={placeholder}
        aria-label={`${label} — ${PAGE_LABELS[pageType]}`}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface ArtDirectionGridProps {
  pageType: SketchPageType;
  value: ArtDirection;
  onFieldChange: (key: keyof ArtDirection, value: string) => void;
}

/** Two-column grid of the 13 art-direction fields for a single page. */
function ArtDirectionGrid({ pageType, value, onFieldChange }: ArtDirectionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {AD_FIELD_LAYOUT.map((column, columnIndex) => (
        <div key={columnIndex} className="space-y-3">
          {column.map((key) => (
            <LabeledTextarea
              key={key}
              fieldKey={key}
              pageType={pageType}
              value={value[key] ?? ''}
              onChange={(next) => onFieldChange(key, next)}
            />
          ))}
        </div>
      ))}
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                <ArtDirectionGrid
                  pageType={page.type}
                  value={seedArtDirection(draft[page.type])}
                  onFieldChange={(key, value) => handleFieldChange(page.type, key, value)}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="mt-4">
            <ArtDirectionGrid
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
