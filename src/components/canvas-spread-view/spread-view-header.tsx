// spread-view-header.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Grid2X2, Minus, Plus } from 'lucide-react';
import { HEADER, ZOOM, COLUMNS } from './constants';
import type { ViewMode } from './types';
import { useSpreadViewKeyboard } from './hooks/use-spread-view-keyboard';

// === Props Interface ===
interface SpreadViewHeaderProps {
  viewMode: ViewMode;
  zoomLevel: number;
  columnsPerRow: number;
  onViewModeToggle: () => void;
  onZoomChange: (level: number) => void;
  onColumnsChange: (columns: number) => void;
  enableKeyboardShortcuts?: boolean;
}

// === Main Component ===
export function SpreadViewHeader({
  viewMode,
  zoomLevel,
  columnsPerRow,
  onViewModeToggle,
  onZoomChange,
  onColumnsChange,
  enableKeyboardShortcuts = true,
}: SpreadViewHeaderProps) {
  const [announcement, setAnnouncement] = useState('');

  // Keyboard shortcuts hook
  useSpreadViewKeyboard({
    viewMode,
    zoomLevel,
    columnsPerRow,
    onViewModeToggle,
    onZoomChange,
    onColumnsChange,
    onAnnounce: setAnnouncement,
    enabled: enableKeyboardShortcuts,
  });

  return (
    <header
      className="flex items-center justify-between px-4 border-b bg-background"
      style={{ height: HEADER.HEIGHT }}
    >
      {/* Left: View Toggle */}
      <ViewToggle viewMode={viewMode} onToggle={onViewModeToggle} />

      {/* Center: Spacer */}
      <div className="flex-grow" />

      {/* Right: Dual Purpose Slider */}
      <DualPurposeSlider
        viewMode={viewMode}
        zoomLevel={zoomLevel}
        columnsPerRow={columnsPerRow}
        onZoomChange={onZoomChange}
        onColumnsChange={onColumnsChange}
      />

      {/* ARIA Live Region for Screen Readers */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </span>
    </header>
  );
}

// === ViewToggle (inline) ===
interface ViewToggleProps {
  viewMode: ViewMode;
  onToggle: () => void;
}

function ViewToggle({ viewMode, onToggle }: ViewToggleProps) {
  const tooltipText = viewMode === 'edit'
    ? 'Show spread grid view'
    : 'Show full spread view';

  const isEditMode = viewMode === 'edit';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isEditMode ? 'default' : 'ghost'}
          size="icon"
          onClick={onToggle}
          aria-pressed={viewMode === 'grid'}
          aria-label={`Switch to ${viewMode === 'edit' ? 'grid' : 'edit'} view`}
          style={{ width: HEADER.TOGGLE_SIZE, height: HEADER.TOGGLE_SIZE }}
          className={
            isEditMode
              ? 'pointer-events-auto'
              : 'hover:bg-muted/50'
          }
        >
          <Grid2X2
            className={isEditMode ? 'h-4 w-4' : 'h-4 w-4 opacity-60'}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// === DualPurposeSlider (inline) ===
interface DualPurposeSliderProps {
  viewMode: ViewMode;
  zoomLevel: number;
  columnsPerRow: number;
  onZoomChange: (level: number) => void;
  onColumnsChange: (columns: number) => void;
}

function DualPurposeSlider({
  viewMode,
  zoomLevel,
  columnsPerRow,
  onZoomChange,
  onColumnsChange,
}: DualPurposeSliderProps) {
  const isEditMode = viewMode === 'edit';

  // Config based on mode
  const config = isEditMode
    ? {
        value: zoomLevel,
        min: ZOOM.MIN,
        max: ZOOM.MAX,
        step: ZOOM.STEP,
        label: `${zoomLevel}%`,
        onChange: onZoomChange,
        ariaLabel: 'Zoom level',
      }
    : {
        value: columnsPerRow,
        min: COLUMNS.MIN,
        max: COLUMNS.MAX,
        step: 1,
        label: `${columnsPerRow}`,
        onChange: onColumnsChange,
        ariaLabel: 'Columns per row',
      };

  const handleDecrease = () => {
    const newValue = Math.max(config.value - config.step, config.min);
    config.onChange(newValue);
  };

  const handleIncrease = () => {
    const newValue = Math.min(config.value + config.step, config.max);
    config.onChange(newValue);
  };

  const handleSliderChange = (values: number[]) => {
    config.onChange(values[0]);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Decrease Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDecrease}
        disabled={config.value <= config.min}
        aria-label={`Decrease ${isEditMode ? 'zoom' : 'columns'}`}
        className="h-8 w-8"
      >
        <Minus className="h-4 w-4" />
      </Button>

      {/* Slider */}
      <Slider
        value={[config.value]}
        min={config.min}
        max={config.max}
        step={config.step}
        onValueChange={handleSliderChange}
        aria-label={config.ariaLabel}
        className="w-[120px]"
      />

      {/* Increase Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleIncrease}
        disabled={config.value >= config.max}
        aria-label={`Increase ${isEditMode ? 'zoom' : 'columns'}`}
        className="h-8 w-8"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {/* Value Label */}
      <span
        className="text-sm font-medium tabular-nums w-12 text-right"
        aria-live="polite"
      >
        {config.label}
      </span>
    </div>
  );
}

export default SpreadViewHeader;
