// sketch-spread-image-toolbar.tsx — floating toolbar for the (locked) full-bleed backdrop
// image on the sketch-spread canvas. Modeled on remix-image-toolbar.tsx.
//
// The image is SELECTABLE but drag/resize-locked (validation decision — overrides the design's
// non-selectable backdrop). This pass ships the toolbar UI only: Extract + Edit are STUBS
// (parity with the Generate stub); endpoints/flows are a later spec. No geometry section
// (the image cannot be resized/moved).
'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Scissors } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToolbarPosition } from '@/features/editor/components/canvas-spread-view';
import { ToolbarIconButton } from '@/features/editor/components/shared-components';
import { createLogger } from '@/utils/logger';
import type { RefObject } from 'react';
import type { Geometry } from '@/types/canvas-types';
import type { SpreadImage } from '@/types/spread-types';

const log = createLogger('Editor', 'SketchSpreadImageToolbar');

export interface SketchSpreadImageToolbarContext {
  item: SpreadImage;
  selectedGeometry: Geometry | null;
  canvasRef: RefObject<HTMLDivElement | null>;
  onExtract: () => void;
  onEdit: () => void;
}

interface SketchSpreadImageToolbarProps {
  context: SketchSpreadImageToolbarContext;
}

export function SketchSpreadImageToolbar({ context }: SketchSpreadImageToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, selectedGeometry, canvasRef, onExtract, onEdit } = context;

  const position = useToolbarPosition({ geometry: selectedGeometry, canvasRef, toolbarRef });

  // Soft-hide until geometry is measured (avoids a flash at 0,0).
  const toolbarStyle: React.CSSProperties = position
    ? { position: 'fixed', top: `${position.top}px`, left: `${position.left}px` }
    : { position: 'fixed', opacity: 0, pointerEvents: 'none' };

  if (typeof document === 'undefined') return null;

  const handleExtract = () => {
    log.info('handleExtract', 'stub — extract endpoint TBD', { itemId: item.id });
    onExtract();
  };

  const handleEdit = () => {
    log.info('handleEdit', 'stub — edit endpoint TBD', { itemId: item.id });
    onEdit();
  };

  const content = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="image"
        role="toolbar"
        aria-label="Spread image toolbar"
        className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
        style={toolbarStyle}
      >
        <ToolbarIconButton icon={Scissors} label="Extract" onClick={handleExtract} />
        <ToolbarIconButton icon={Pencil} label="Edit" onClick={handleEdit} />
      </div>
    </TooltipProvider>
  );

  return createPortal(content, document.body);
}
