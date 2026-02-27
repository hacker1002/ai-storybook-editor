// utils/context-builders.ts - Context factory functions for render props

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadObject,
  ImageItemContext,
  TextItemContext,
  ObjectItemContext,
  TextToolbarContext,
  SelectedElement,
  Geometry,
  Typography,
  Fill,
  Outline,
  SpreadItemActionUnion,
} from '../types';
import { getFirstTextboxKey } from '../../shared';
import type { SpreadTextboxContent } from '../../shared/types';
import type { RefObject } from 'react';

type SpreadItemActionHandler = (params: Omit<SpreadItemActionUnion, 'spreadId'>) => void;
type SelectFn = (element: SelectedElement, rect?: DOMRect) => void;

/**
 * Build image item context for render props
 */
export function buildImageContext<TSpread extends BaseSpread>(
  image: SpreadImage,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  onEditingChange?: (isEditing: boolean) => void
): ImageItemContext<TSpread> {
  return {
    item: image,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'image' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: (rect?: DOMRect) => onSelect({ type: 'image', index }, rect),
    onUpdate: (updates) => onAction({
      itemType: 'image',
      action: 'update',
      itemId: image.id,
      data: updates
    }),
    onDelete: () => onAction({
      itemType: 'image',
      action: 'delete',
      itemId: image.id,
      data: null
    }),
    onArtNoteChange: (artNote) => onAction({
      itemType: 'image',
      action: 'update',
      itemId: image.id,
      data: { art_note: artNote }
    }),
    onEditingChange,
  };
}

/**
 * Build text item context for render props
 */
export function buildTextContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  onEditingChange?: (isEditing: boolean) => void
): TextItemContext<TSpread> {
  const langKey = getFirstTextboxKey(textbox);
  const langContent = langKey
    ? (textbox[langKey] as SpreadTextboxContent)
    : undefined;

  return {
    item: textbox,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'textbox' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: (rect?: DOMRect) => onSelect({ type: 'textbox', index }, rect),
    onTextChange: (text) => {
      if (!langKey) return;
      onAction({
        itemType: 'text',
        action: 'update',
        itemId: textbox.id,
        data: { [langKey]: { ...langContent, text } } as Partial<SpreadTextbox>
      });
    },
    onUpdate: (updates) => onAction({
      itemType: 'text',
      action: 'update',
      itemId: textbox.id,
      data: updates
    }),
    onDelete: () => onAction({
      itemType: 'text',
      action: 'delete',
      itemId: textbox.id,
      data: null
    }),
    onEditingChange,
  };
}

/**
 * Build text toolbar context with formatting callbacks
 */
export function buildTextToolbarContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  canvasRef: RefObject<HTMLDivElement | null>,
  selectedGeometry: Geometry | null,
  onEditingChange?: (isEditing: boolean) => void
): TextToolbarContext<TSpread> {
  const langKey = getFirstTextboxKey(textbox);
  const langContent = langKey
    ? (textbox[langKey] as SpreadTextboxContent)
    : undefined;

  const baseContext = buildTextContext(
    textbox,
    index,
    spread,
    selectedElement,
    onSelect,
    onAction,
    onEditingChange
  );

  return {
    ...baseContext,
    selectedGeometry,
    canvasRef,
    onFormatText: (format: Partial<Typography>) => {
      if (!langKey) return;
      onAction({
        itemType: 'text',
        action: 'update',
        itemId: textbox.id,
        data: {
          [langKey]: {
            ...langContent,
            typography: { ...langContent?.typography, ...format },
          },
        } as Partial<SpreadTextbox>,
      });
    },
    onClone: () => {
      const clonedItem: SpreadTextbox = structuredClone(textbox);
      clonedItem.id = crypto.randomUUID();

      const cloneLangKey = getFirstTextboxKey(clonedItem);
      if (cloneLangKey) {
        const cloneLangData = clonedItem[cloneLangKey] as SpreadTextboxContent;
        const maxX = Math.max(0, 100 - cloneLangData.geometry.w);
        const maxY = Math.max(0, 100 - cloneLangData.geometry.h);
        cloneLangData.geometry.x = Math.min(maxX, cloneLangData.geometry.x + 5);
        cloneLangData.geometry.y = Math.min(maxY, cloneLangData.geometry.y + 5);
      }

      onAction({
        itemType: 'text',
        action: 'add',
        itemId: null,
        data: clonedItem,
      });
    },
    onUpdateBackground: (bg: Partial<Fill>) => {
      if (!langKey) return;
      const defaultFill: Fill = { color: '#ffffff', opacity: 0 };
      onAction({
        itemType: 'text',
        action: 'update',
        itemId: textbox.id,
        data: {
          [langKey]: {
            ...langContent,
            fill: { ...(langContent?.fill || defaultFill), ...bg },
          },
        } as Partial<SpreadTextbox>,
      });
    },
    onUpdateOutline: (outlineUpdates: Partial<Outline>) => {
      if (!langKey) return;
      const defaultOutline: Outline = { color: '#000000', width: 2, radius: 8, type: 'solid' };
      onAction({
        itemType: 'text',
        action: 'update',
        itemId: textbox.id,
        data: {
          [langKey]: {
            ...langContent,
            outline: { ...(langContent?.outline || defaultOutline), ...outlineUpdates },
          },
        } as Partial<SpreadTextbox>,
      });
    },
  };
}

/**
 * Build object item context for render props
 */
export function buildObjectContext<TSpread extends BaseSpread>(
  object: SpreadObject,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler
): ObjectItemContext<TSpread> {
  return {
    item: object,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'object' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: () => onSelect({ type: 'object', index }),
    onUpdate: (updates) => onAction({
      itemType: 'object',
      action: 'update',
      itemId: object.id,
      data: updates
    }),
    onDelete: () => onAction({
      itemType: 'object',
      action: 'delete',
      itemId: object.id,
      data: null
    }),
  };
}

/**
 * Build view-only image context for thumbnails
 */
export function buildViewOnlyImageContext<TSpread extends BaseSpread>(
  image: SpreadImage,
  index: number,
  spread: TSpread
): ImageItemContext<TSpread> {
  return {
    item: image,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build view-only text context for thumbnails
 */
export function buildViewOnlyTextContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread
): TextItemContext<TSpread> {
  return {
    item: textbox,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onTextChange: () => {},
    onUpdate: () => {},
    onDelete: () => {},
    onEditingChange: () => {},
  };
}

/**
 * Build view-only object context for thumbnails
 */
export function buildViewOnlyObjectContext<TSpread extends BaseSpread>(
  object: SpreadObject,
  index: number,
  spread: TSpread
): ObjectItemContext<TSpread> {
  return {
    item: object,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}
