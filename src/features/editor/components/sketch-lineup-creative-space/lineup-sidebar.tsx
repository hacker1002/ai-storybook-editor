// lineup-sidebar.tsx — left sidebar of SketchLineupSpace (design 01). Header = tri-state select-all
// checkbox + title "Lineup" (⚡ NO ＋ button — deviation vs mock, chốt user 2026-07-17: the lineup
// imports nothing). Two collapsible groups (Character / Prop); each row = ONE variant (base
// INCLUDED, unlike the Variants space) with a checkbox.
//
// Rows lacking a locked crop or a height render DISABLED + greyed + ⓘ reason tooltip — never
// filtered out (memory: never-hide-disabled-ui): the WHY + where-to-fix must stay discoverable.
//
// No local state (checked/expanded are lifted to the root), no destructive action / hotkey
// (memory: sidebars don't own destructive hotkeys — unchecking IS the removal), and no lock: the
// space is read-only, checking a row mutates nothing (README §5).

import { useId, useMemo } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { BaseKind, LineupEntry } from '@/types/sketch';
import {
  disabledReason,
  rowLabel,
  selectable,
  type KindGroupConfig,
} from './lineup-constants';

const log = createLogger('Editor', 'LineupSidebar');

interface LineupSidebarProps {
  groups: KindGroupConfig[];
  entriesByKind: Record<BaseKind, LineupEntry[]>;
  checkedRefs: ReadonlySet<string>;
  expandedGroups: Record<BaseKind, boolean>;
  onToggleEntry: (entry: LineupEntry, checked: boolean) => void;
  /** true = check EVERY selectable entry; false = clear all. */
  onToggleAll: (checked: boolean) => void;
  onToggleGroup: (kind: BaseKind) => void;
}

export function LineupSidebar({
  groups,
  entriesByKind,
  checkedRefs,
  expandedGroups,
  onToggleEntry,
  onToggleAll,
  onToggleGroup,
}: LineupSidebarProps) {
  // Select-all tri-state (design 01 §2.3) — derived from the SELECTABLE entries only: disabled rows
  // are inert, so they must not hold "all checked" hostage.
  const { allChecked, someChecked, hasSelectable } = useMemo(() => {
    const selectableEntries = groups.flatMap((g) => entriesByKind[g.kind].filter(selectable));
    const checkedCount = selectableEntries.filter((e) => checkedRefs.has(e.ref)).length;
    return {
      allChecked: selectableEntries.length > 0 && checkedCount === selectableEntries.length,
      someChecked: checkedCount > 0,
      hasSelectable: selectableEntries.length > 0,
    };
  }, [groups, entriesByKind, checkedRefs]);

  const handleToggleAll = () => {
    // Anything short of "all checked" → select all; only a full set clears (design 01 §2.3).
    const next = !allChecked;
    log.info('handleToggleAll', 'select-all toggled', { next, allChecked, someChecked });
    onToggleAll(next);
  };

  return (
    <aside
      className="flex h-full w-1/4 min-w-[260px] max-w-[340px] flex-col border-r"
      role="navigation"
      aria-label="Lineup sidebar"
    >
      {/* Header: select-all + title. ⚡ NO ＋ button (nothing is imported here). */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked && !allChecked}
          disabled={!hasSelectable}
          onCheckedChange={handleToggleAll}
          aria-label="Select all variants"
        />
        <span className="text-sm font-semibold">Lineup</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2" role="tree" aria-label="Lineup variants">
        {groups.map((group) => (
          <LineupKindGroup
            key={group.kind}
            group={group}
            entries={entriesByKind[group.kind]}
            expanded={expandedGroups[group.kind]}
            checkedRefs={checkedRefs}
            onToggleEntry={onToggleEntry}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </div>
    </aside>
  );
}

function LineupKindGroup({
  group,
  entries,
  expanded,
  checkedRefs,
  onToggleEntry,
  onToggleGroup,
}: {
  group: KindGroupConfig;
  entries: LineupEntry[];
  expanded: boolean;
  checkedRefs: ReadonlySet<string>;
  onToggleEntry: (entry: LineupEntry, checked: boolean) => void;
  onToggleGroup: (kind: BaseKind) => void;
}) {
  const { kind, title, noun } = group;

  return (
    <div className="mb-1" role="group">
      <div className="flex items-center gap-1 rounded-md px-1 hover:bg-muted/50">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium"
          aria-expanded={expanded}
          onClick={() => onToggleGroup(kind)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{title}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-0.5 space-y-0.5 pl-4">
          {entries.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No {noun}s imported yet</p>
          ) : (
            // Snapshot order — this order also decides the left→right order on the canvas.
            entries.map((entry) => (
              <LineupRow
                key={entry.ref}
                entry={entry}
                checked={checkedRefs.has(entry.ref)}
                onToggleEntry={onToggleEntry}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LineupRow({
  entry,
  checked,
  onToggleEntry,
}: {
  entry: LineupEntry;
  checked: boolean;
  onToggleEntry: (entry: LineupEntry, checked: boolean) => void;
}) {
  const reason = disabledReason(entry);
  const isDisabled = reason != null;
  const label = rowLabel(entry);
  const reasonId = useId();

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5',
        isDisabled ? 'opacity-50' : 'hover:bg-muted/50',
      )}
      aria-disabled={isDisabled}
    >
      <Checkbox
        checked={checked}
        disabled={isDisabled}
        onCheckedChange={(next) => onToggleEntry(entry, next)}
        aria-label={label}
        aria-describedby={reason ? reasonId : undefined}
      />
      <span className={cn('min-w-0 flex-1 truncate text-sm', isDisabled && 'text-muted-foreground')} title={label}>
        {label}
      </span>
      {/* ⓘ carries the WHY + where to fix. The icon (NOT the disabled checkbox, which is inert to
          hover) is what surfaces the native title on hover; the sr-only twin is what `aria-describedby`
          above resolves to, so a screen reader gets the reason from the checkbox itself instead of
          having to stumble onto the icon. NOT role="tooltip" — a tooltip must be referenced by its
          trigger, and a standalone one is an orphan node. */}
      {reason && (
        <span title={reason}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        </span>
      )}
    </div>
  );
}
