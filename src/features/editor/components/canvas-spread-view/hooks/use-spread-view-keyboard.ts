// use-spread-view-keyboard.ts
import { useEffect } from 'react';
import type { ViewMode } from '../types';
import { ZOOM, COLUMNS } from '../constants';

interface UseSpreadViewKeyboardProps {
  viewMode: ViewMode;
  zoomLevel: number;
  columnsPerRow: number;
  onViewModeToggle: () => void;
  onZoomChange: (level: number) => void;
  onColumnsChange: (columns: number) => void;
  onAnnounce?: (message: string) => void;
  enabled?: boolean;
}

/**
 * Custom hook for handling keyboard shortcuts in SpreadViewHeader
 * - G: Toggle view mode
 * - +/=: Increase zoom (edit) or columns (grid)
 * - -: Decrease zoom (edit) or columns (grid)
 */
export function useSpreadViewKeyboard({
  viewMode,
  zoomLevel,
  columnsPerRow,
  onViewModeToggle,
  onZoomChange,
  onColumnsChange,
  onAnnounce,
  enabled = true,
}: UseSpreadViewKeyboardProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      // Skip if focus is on input/textarea
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      // Toggle view mode with 'G'
      if (key === 'g') {
        event.preventDefault();
        onViewModeToggle();
        const newMode = viewMode === 'edit' ? 'grid' : 'edit';
        onAnnounce?.(`Switched to ${newMode} view`);
        return;
      }

      // Increase zoom/columns with '+' or '='
      if (key === '+' || key === '=') {
        event.preventDefault();

        if (viewMode === 'edit') {
          const newZoom = Math.min(zoomLevel + ZOOM.STEP, ZOOM.MAX);
          if (newZoom !== zoomLevel) {
            onZoomChange(newZoom);
            onAnnounce?.(`Zoom ${newZoom}%`);
          }
        } else {
          const newCols = Math.min(columnsPerRow + 1, COLUMNS.MAX);
          if (newCols !== columnsPerRow) {
            onColumnsChange(newCols);
            onAnnounce?.(`${newCols} columns`);
          }
        }
        return;
      }

      // Decrease zoom/columns with '-'
      if (key === '-') {
        event.preventDefault();

        if (viewMode === 'edit') {
          const newZoom = Math.max(zoomLevel - ZOOM.STEP, ZOOM.MIN);
          if (newZoom !== zoomLevel) {
            onZoomChange(newZoom);
            onAnnounce?.(`Zoom ${newZoom}%`);
          }
        } else {
          const newCols = Math.max(columnsPerRow - 1, COLUMNS.MIN);
          if (newCols !== columnsPerRow) {
            onColumnsChange(newCols);
            onAnnounce?.(`${newCols} columns`);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    viewMode,
    zoomLevel,
    columnsPerRow,
    onViewModeToggle,
    onZoomChange,
    onColumnsChange,
    onAnnounce,
  ]);
}
