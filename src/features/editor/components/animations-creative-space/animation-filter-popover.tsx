// animation-filter-popover.tsx - Filter popover for AnimationsCreativeSpace
// Filters: object, effect category, trigger type — changes apply immediately

import type { AnimationFilterState, ObjectFilterOption, EffectCategory } from '@/types/animation-types';
import { EFFECT_CATEGORY_LABELS, STAR_COLOR_MAP, TRIGGER_TYPE_LABELS } from '@/constants/animation-constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EFFECT_CATEGORIES = Object.keys(EFFECT_CATEGORY_LABELS) as EffectCategory[];

interface AnimationFilterPopoverProps {
  open: boolean;
  filterState: AnimationFilterState;
  objectFilterOptions: ObjectFilterOption[];
  onFilterChange: (updates: Partial<AnimationFilterState>) => void;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode; // trigger element from parent
}

export function AnimationFilterPopover({
  open,
  filterState,
  objectFilterOptions,
  onFilterChange,
  onOpenChange,
  children,
}: AnimationFilterPopoverProps) {
  const handleTriggerToggle = (key: string, checked: boolean) => {
    const newSet = new Set(filterState.triggerFilters);
    if (checked) {
      newSet.add(key);
    } else {
      newSet.delete(key);
    }
    onFilterChange({ triggerFilters: newSet });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="end">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Filter</p>

          {/* Object filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Object</label>
            <Select
              value={filterState.objectFilter}
              onValueChange={(value) => onFilterChange({ objectFilter: value })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {objectFilterOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effect category filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Effect</label>
            <Select
              value={filterState.effectFilter}
              onValueChange={(value) => onFilterChange({ effectFilter: value })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Effects</SelectItem>
                {EFFECT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: STAR_COLOR_MAP[cat] }}
                      />
                      {EFFECT_CATEGORY_LABELS[cat]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trigger type checkboxes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Trigger</label>
            <div className="space-y-1.5">
              {Object.entries(TRIGGER_TYPE_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={filterState.triggerFilters.has(key)}
                    onChange={(e) => handleTriggerToggle(key, e.target.checked)}
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
