// page-numbering-overlay.tsx - Renders page numbers on the canvas spread
// Non-interactive overlay; handles both DPS (single page object) and non-DPS (two page objects).
// Font size is scaled by zoom factor (zoomLevel / 100) — same pattern as editable-textbox.
import type { PageData } from '@/types/canvas-types';
import type { PageNumberingPosition } from '@/types/editor';
import { useZoomLevel } from '@/stores/editor-settings-store';

interface PageNumberingOverlayProps {
  pages: PageData[];
  position: Exclude<PageNumberingPosition, 'none'>;
  color: string;
  fontFamily?: string;
  fontSize?: number;
}

type Side = 'left' | 'right';

function getPageStyle(
  side: Side,
  position: Exclude<PageNumberingPosition, 'none'>,
  color: string,
  fontFamily: string,
  scaledFontSize: number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    color,
    fontSize: `${scaledFontSize}px`,
    fontFamily,
    padding: '4px 8px',
    pointerEvents: 'none',
    zIndex: 1,
    lineHeight: '1',
  };

  switch (position) {
    case 'bottom_center':
      return {
        ...base,
        bottom: '8px',
        left: side === 'left' ? '25%' : '75%',
        transform: 'translateX(-50%)',
      };
    case 'bottom_corner':
      return {
        ...base,
        bottom: '8px',
        ...(side === 'left' ? { left: '12px' } : { right: '12px' }),
      };
    case 'top_corner':
      return {
        ...base,
        top: '8px',
        ...(side === 'left' ? { left: '12px' } : { right: '12px' }),
      };
  }
}

export function PageNumberingOverlay({
  pages,
  position,
  color,
  fontFamily = 'Nunito',
  fontSize = 18,
}: PageNumberingOverlayProps) {
  const zoomLevel = useZoomLevel();
  const scaledFontSize = fontSize * (zoomLevel / 100);
  const isDPS = pages.length === 1;

  if (isDPS) {
    // DPS: single page object stores number as "left-right" string (e.g. "2-3")
    const raw = String(pages[0].number);
    const dashIdx = raw.indexOf('-');
    const leftNum = dashIdx !== -1 ? raw.slice(0, dashIdx) : raw;
    const rightNum = dashIdx !== -1 ? raw.slice(dashIdx + 1) : raw;

    return (
      <>
        <span style={getPageStyle('left', position, color, fontFamily, scaledFontSize)}>{leftNum}</span>
        <span style={getPageStyle('right', position, color, fontFamily, scaledFontSize)}>{rightNum}</span>
      </>
    );
  }

  // Non-DPS: pages[0] = left page, pages[1] = right page
  return (
    <>
      {pages[0] && (
        <span style={getPageStyle('left', position, color, fontFamily, scaledFontSize)}>{pages[0].number}</span>
      )}
      {pages[1] && (
        <span style={getPageStyle('right', position, color, fontFamily, scaledFontSize)}>{pages[1].number}</span>
      )}
    </>
  );
}
