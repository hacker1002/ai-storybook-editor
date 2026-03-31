// section-bounding-box.tsx - Collapsible section container for grid view
"use client";

import { useState, type ReactNode } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import type { Section } from './branch-types';

const log = createLogger('Editor', 'SectionBoundingBox');

interface SectionBoundingBoxProps {
  section: Section;
  isSelected: boolean;
  columnsPerRow: number;
  children: ReactNode;
  onSelect: () => void;
  onTrashClick: () => void;
}

export function SectionBoundingBox({
  section,
  isSelected,
  columnsPerRow,
  children,
  onSelect,
  onTrashClick,
}: SectionBoundingBoxProps) {
  const [isHoveringTrash, setIsHoveringTrash] = useState(false);

  const handleTrashClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    log.info('SectionBoundingBox', 'trash clicked', { sectionId: section.id });
    onTrashClick();
  };

  // Count children spreads from React children (count by rendering)
  const spreadCount = (() => {
    let count = 0;
    // Walk through children to count SpreadThumbnail elements
    const countChildren = (node: ReactNode): number => {
      if (!node) return 0;
      if (Array.isArray(node)) return node.reduce((acc, child) => acc + countChildren(child), 0);
      return 1;
    };
    count = countChildren(children);
    return count;
  })();

  // Span columns based on spread count, capped at columnsPerRow
  const colSpan = Math.min(spreadCount, columnsPerRow);

  return (
    <div
      className={cn(
        'border rounded-lg p-3 transition-colors cursor-pointer',
        isSelected
          ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500'
          : 'border-blue-200 bg-blue-50/20',
      )}
      style={{ gridColumn: `span ${colSpan}` }}
      onClick={onSelect}
    >
      {/* Title bar — click bubbles to container for section selection */}
      <div className="flex items-center gap-2 select-none group">
        <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {section.title ?? 'Untitled Section'}
        </span>
        <span className="text-xs text-muted-foreground">
          {spreadCount} spread{spreadCount !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={handleTrashClick}
          onMouseEnter={() => setIsHoveringTrash(true)}
          onMouseLeave={() => setIsHoveringTrash(false)}
          className={cn(
            'p-1 rounded transition-opacity',
            'opacity-0 group-hover:opacity-100',
            isHoveringTrash ? 'text-red-500' : 'text-muted-foreground',
          )}
          aria-label="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Children grid — always visible in main view (collapse only affects sidebar) */}
      <div
        className="mt-3"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${colSpan}, 1fr)`,
          gap: '16px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default SectionBoundingBox;
