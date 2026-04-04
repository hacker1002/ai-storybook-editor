// layout-thumbnail.tsx - SVG thumbnail renderer for template layouts.
// Shared by LayoutCard (settings page) and LayoutOption (modal grid).
// Renders image zones and textbox zones as rounded rects from geometry percentages.

import { cn } from '@/utils/utils';
import type { TemplateLayoutTextbox, TemplateLayoutImage } from '@/types/editor';

interface LayoutThumbnailProps {
  textboxes: TemplateLayoutTextbox[];
  images: TemplateLayoutImage[];
  type: number;         // 1: double page spread (3:2), 2: single page (3:4)
  isSelected?: boolean;
  className?: string;
}

export function LayoutThumbnail({ textboxes, images, type, isSelected, className }: LayoutThumbnailProps) {
  // Spread: 200×133 (3:2 landscape), Single: 100×133 (3:4 portrait)
  const isSpread = type === 1;
  const vbW = isSpread ? 200 : 100;
  const vbH = 133;

  // Convert geometry percentage to SVG coordinate
  const px = (pct: number) => (pct / 100) * vbW;
  const py = (pct: number) => (pct / 100) * vbH;

  const sortedImages = [...images].sort((a, b) => a['z-index'] - b['z-index']);
  const sortedTextboxes = [...textboxes].sort((a, b) => a['z-index'] - b['z-index']);

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={cn(
        'w-full rounded',
        isSpread ? 'aspect-[3/2]' : 'aspect-[3/4]',
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect x={0} y={0} width={vbW} height={vbH} rx={4} fill={isSelected ? '#EEF2FF' : '#F5F5F7'} />

      {/* Image zones — rounded rect */}
      {sortedImages.map((img, i) => (
        <rect
          key={i}
          x={px(img.geometry.x)}
          y={py(img.geometry.y)}
          width={px(img.geometry.w)}
          height={py(img.geometry.h)}
          rx={3}
          fill={isSelected ? '#A5BFFA' : '#D8DAE0'}
        />
      ))}

      {/* Textbox zones — rounded rect with "T" label to distinguish from image zones */}
      {sortedTextboxes.map((tb, i) => {
        const x = px(tb.geometry.x);
        const y = py(tb.geometry.y);
        const w = px(tb.geometry.w);
        const h = py(tb.geometry.h);
        const fill = isSelected ? '#8AAFF8' : '#C8CAD0';
        const fontSize = Math.max(6, Math.min(w * 0.35, h * 0.6, 14));
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} rx={2} fill={fill} />
            <text
              x={x + w / 2}
              y={y + h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight="bold"
              fill={isSelected ? '#4A7BF7' : '#8A8E9A'}
              fontFamily="sans-serif"
            >
              T
            </text>
          </g>
        );
      })}

      {/* Center spine line for double-page spread — rendered last to stay on top */}
      {isSpread && (
        <line x1={vbW / 2} y1={0} x2={vbW / 2} y2={vbH} stroke={isSelected ? '#7BA8F6' : '#BEC1CC'} strokeWidth={1} />
      )}

      {/* Selected highlight border */}
      {isSelected && (
        <rect
          x={1}
          y={1}
          width={vbW - 2}
          height={vbH - 2}
          rx={3}
          fill="none"
          stroke="#4A7BF7"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
