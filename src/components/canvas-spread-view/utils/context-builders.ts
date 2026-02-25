// utils/context-builders.ts - Context factory functions for render props

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadObject,
  SpreadAnimation,
  ImageItemContext,
  TextItemContext,
  ObjectItemContext,
  AnimationItemContext,
  SelectedElement,
  Geometry,
  Typography,
  Fill,
  Outline,
} from '../types';

type UpdateImageFn = (index: number, updates: Partial<SpreadImage>) => void;
type UpdateTextboxFn = (index: number, updates: Partial<SpreadTextbox>) => void;
type UpdateObjectFn = (index: number, updates: Partial<SpreadObject>) => void;
type UpdateAnimationFn = (index: number, updates: Partial<SpreadAnimation>) => void;
type DeleteFn = (index: number) => void;
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
  onUpdate: UpdateImageFn,
  onDelete?: DeleteFn,
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
    onUpdate: (updates) => onUpdate(index, updates),
    onDelete: () => onDelete?.(index),
    onArtNoteChange: (artNote) => onUpdate(index, { art_note: artNote }),
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
  onUpdate: UpdateTextboxFn,
  onDelete?: DeleteFn,
  languageKey = 'en_US',
  onEditingChange?: (isEditing: boolean) => void
): TextItemContext<TSpread> {
  const langContent = textbox[languageKey] as { text: string; geometry: Geometry; typography: Typography; fill?: Fill; outline?: Outline } | undefined;

  return {
    item: textbox,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'textbox' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: (rect?: DOMRect) => onSelect({ type: 'textbox', index }, rect),
    onTextChange: (text) => onUpdate(index, { [languageKey]: { ...langContent, text } } as Partial<SpreadTextbox>),
    onUpdate: (updates) => onUpdate(index, updates),
    onDelete: () => onDelete?.(index),
    onEditingChange,
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
  onUpdate: UpdateObjectFn,
  onDelete?: DeleteFn
): ObjectItemContext<TSpread> {
  return {
    item: object,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'object' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: () => onSelect({ type: 'object', index }),
    onUpdate: (updates) => onUpdate(index, updates),
    onDelete: () => onDelete?.(index),
  };
}

/**
 * Build animation item context for render props
 */
export function buildAnimationContext<TSpread extends BaseSpread>(
  animation: SpreadAnimation,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onUpdate: UpdateAnimationFn,
  onDelete?: DeleteFn
): AnimationItemContext<TSpread> {
  return {
    item: animation,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: selectedElement?.type === 'animation' && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: () => onSelect({ type: 'animation', index }),
    onUpdate: (updates) => onUpdate(index, updates),
    onDelete: () => onDelete?.(index),
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
