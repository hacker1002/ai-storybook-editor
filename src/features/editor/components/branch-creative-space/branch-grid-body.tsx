// branch-grid-body.tsx - CSS grid renderer for spreads and section groups
"use client";

import { useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { useLanguageCode } from '@/stores/editor-settings-store';
import { SpreadThumbnail } from '../canvas-spread-view/spread-thumbnail';
import { EditableImage } from '../shared-components/editable-image';
import { EditableTextbox } from '../shared-components/editable-textbox';
import { EditableShape } from '../shared-components/editable-shape';
import { AddModeSpreadThumbnail } from './add-mode-spread-thumbnail';
import { SectionBoundingBox } from './section-bounding-box';
import { SettingButton } from './setting-button';
import { getTextboxContentForLanguage } from '@/features/editor/utils/textbox-helpers';
import type { GridLayoutItem } from './branch-types';
import type { BaseSpread, SpreadImage } from '@/types/spread-types';
import type { ImageItemContext, TextItemContext, ShapeItemContext } from '@/types/canvas-types';

const log = createLogger('Editor', 'BranchGridBody');

// Resolve best available image URL for illustration images
function resolveImageUrl(image: SpreadImage): string | null {
  if (image.final_hires_media_url) return image.final_hires_media_url;
  const selected = image.illustrations?.find((v) => v.is_selected);
  if (selected?.media_url) return selected.media_url;
  if (image.illustrations?.[0]?.media_url) return image.illustrations[0].media_url;
  return null;
}

const RENDER_ITEMS: ('image' | 'textbox' | 'shape')[] = ['image', 'textbox', 'shape'];
const NOOP = () => {};

interface BranchGridBodyProps {
  gridItems: GridLayoutItem[];
  columnsPerRow: number;
  selectedSpreadId: string | null;
  selectedSectionId: string | null;
  isAddMode: boolean;
  addSectionSelectedIds: string[];
  selectableSpreads: Set<string>;
  onSpreadSelect: (id: string) => void;
  onSectionSelect: (id: string) => void;
  onSpreadGearClick: (id: string) => void;
  onDeleteSection: (id: string) => void;
  onAddSectionSpreadToggle: (id: string) => void;
}

export function BranchGridBody({
  gridItems,
  columnsPerRow,
  selectedSpreadId,
  selectedSectionId,
  isAddMode,
  addSectionSelectedIds,
  selectableSpreads,
  onSpreadSelect,
  onSectionSelect,
  onSpreadGearClick,
  onDeleteSection,
  onAddSectionSpreadToggle,
}: BranchGridBodyProps) {
  const langCode = useLanguageCode();
  log.debug('BranchGridBody', 'render', { itemCount: gridItems.length, isAddMode });

  // Reuse existing Editable components in read-only mode for thumbnail rendering
  const renderImageItem = useCallback((ctx: ImageItemContext<BaseSpread>) => {
    const imageUrl = resolveImageUrl(ctx.item);
    return (
      <EditableImage
        image={{ ...ctx.item, media_url: imageUrl ?? undefined }}
        index={ctx.itemIndex}
        zIndex={ctx.zIndex}
        isSelected={false}
        isEditable={false}
        onSelect={NOOP}
      />
    );
  }, []);

  const renderTextItem = useCallback((ctx: TextItemContext<BaseSpread>) => {
    const result = getTextboxContentForLanguage(ctx.item as unknown as Record<string, unknown>, langCode);
    if (!result) return null;
    return (
      <EditableTextbox
        textboxContent={result.content}
        index={ctx.itemIndex}
        zIndex={ctx.zIndex}
        isSelected={false}
        isSelectable={false}
        isEditable={false}
        onSelect={NOOP}
        onTextChange={NOOP}
        onEditingChange={NOOP}
      />
    );
  }, [langCode]);

  const renderShapeItem = useCallback((ctx: ShapeItemContext<BaseSpread>) => {
    return (
      <EditableShape
        shape={ctx.item}
        index={ctx.itemIndex}
        zIndex={ctx.zIndex}
        isSelected={false}
        isEditable={false}
        onSelect={NOOP}
      />
    );
  }, []);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
        gap: '16px',
      }}
    >
      {gridItems.map((item, idx) => {
        if (item.type === 'free-spread') {
          const { spread } = item;
          const isSelected = selectedSpreadId === spread.id;

          if (isAddMode) {
            return (
              <AddModeSpreadThumbnail
                key={spread.id}
                spread={spread}
                spreadIndex={idx}
                isSelectable={selectableSpreads.has(spread.id)}
                isSelected={addSectionSelectedIds.includes(spread.id)}
                onToggle={() => onAddSectionSpreadToggle(spread.id)}
                renderImageItem={renderImageItem}
                renderTextItem={renderTextItem}
                renderShapeItem={renderShapeItem}
              />
            );
          }

          return (
            <div key={spread.id} className="relative pt-10">
              <SpreadThumbnail
                spread={spread}
                spreadIndex={idx}
                isSelected={isSelected}
                size="medium"
                renderItems={RENDER_ITEMS}
                renderImageItem={renderImageItem}
                renderTextItem={renderTextItem}
                renderShapeItem={renderShapeItem}
                onClick={() => {
                  log.debug('BranchGridBody', 'spread selected', { spreadId: spread.id });
                  onSpreadSelect(spread.id);
                }}
              />
              {isSelected && (
                <div className="absolute right-2 top-12 z-20">
                  <SettingButton onClick={() => onSpreadGearClick(spread.id)} />
                </div>
              )}
            </div>
          );
        }

        if (item.type === 'section-group') {
          const { section, spreads } = item;

          // In add mode, render section spreads as flat items (no bounding box)
          if (isAddMode) {
            return spreads.map((spread, spreadIdx) => (
              <AddModeSpreadThumbnail
                key={spread.id}
                spread={spread}
                spreadIndex={spreadIdx}
                isSelectable={selectableSpreads.has(spread.id)}
                isSelected={addSectionSelectedIds.includes(spread.id)}
                onToggle={() => onAddSectionSpreadToggle(spread.id)}
                renderImageItem={renderImageItem}
                renderTextItem={renderTextItem}
                renderShapeItem={renderShapeItem}
              />
            ));
          }

          return (
            <SectionBoundingBox
              key={section.id}
              section={section}
              isSelected={selectedSectionId === section.id}
              columnsPerRow={columnsPerRow}
              onSelect={() => onSectionSelect(section.id)}
              onTrashClick={() => onDeleteSection(section.id)}
            >
              {spreads.map((spread, spreadIdx) => (
                <SpreadThumbnail
                  key={spread.id}
                  spread={spread}
                  spreadIndex={spreadIdx}
                  isSelected={selectedSpreadId === spread.id}
                  size="medium"
                  renderItems={RENDER_ITEMS}
                  renderImageItem={renderImageItem}
                  renderTextItem={renderTextItem}
                  renderShapeItem={renderShapeItem}
                  onClick={() => {
                    log.debug('BranchGridBody', 'section spread selected', {
                      spreadId: spread.id,
                      sectionId: section.id,
                    });
                    onSpreadSelect(spread.id);
                  }}
                />
              ))}
            </SectionBoundingBox>
          );
        }

        return null;
      })}
    </div>
  );
}

export default BranchGridBody;
