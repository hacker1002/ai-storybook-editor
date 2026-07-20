// base-kind-sidebar.tsx — left sidebar of SketchBaseSpace (design 01). Header "Base" + Excel
// import; two collapsible groups (Character / Prop), each with edit-entity (✏) + add-style (＋)
// and a list of Style rows (select + lock). NO Stage group — base covers char + prop only.
// Lock is exclusive WITHIN a sheet (char/prop independent); clicking an already-locked style
// re-sets itself (no-op) — there is no unlock-to-0 (Validation S1).
//
// Collab peer-lock (ADR-043): each KIND group self-reads its SHEET lock (step 1 / rtype 11,
// resource_id character_sheet · prop_sheet). When ANOTHER editor holds the sheet, the group shows a
// 🔒 holder badge and DISABLES the sheet acquire-seams — ＋ (add style) + each row's 🔒 (lock) —
// greyed, NOT hidden (memory: never-hide-disabled-ui). Browse (row select) + ✏ (edit entity, grain
// B rtype 3/4) stay enabled. Advisory — the acquire 409 is the real authority.

import { useMemo, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BaseKind, SketchBaseStyle } from '@/types/sketch';
import type { BaseSheetGenerateOp } from '@/stores/snapshot-store/types';
import { useIsLockedByOther, useLockHolderName } from '@/stores/resource-lock-store';
import { resolveSketchBaseSheetLockTarget } from '@/stores/snapshot-store/slices/collab-sketch-base-sheet-save-helper';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { KindGroupConfig, SelectedStyleRef } from './sketch-base-constants';

const log = createLogger('Editor', 'BaseKindSidebar');

interface BaseKindSidebarProps {
  groups: KindGroupConfig[];
  stylesByKind: Record<BaseKind, SketchBaseStyle[]>;
  selectedStyle: SelectedStyleRef | null;
  expandedGroups: Record<BaseKind, boolean>;
  onSelectStyle: (kind: BaseKind, index: number) => void;
  onToggleGroup: (kind: BaseKind) => void;
  onAddStyle: (kind: BaseKind) => void;
  onLockStyle: (kind: BaseKind, index: number) => void;
  onEditEntity: (kind: BaseKind) => void;
  onImport: (file: File) => void;
  isImporting: boolean;
  /** Single-flight generate op → drives the per-row "generating" spinner (matches kind+styleIndex). */
  generateOps: Partial<Record<BaseKind, BaseSheetGenerateOp>>;
}

export function BaseKindSidebar({
  groups,
  stylesByKind,
  selectedStyle,
  expandedGroups,
  onSelectStyle,
  onToggleGroup,
  onAddStyle,
  onLockStyle,
  onEditEntity,
  onImport,
  isImporting,
  generateOps,
}: BaseKindSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the SAME file still fires onChange.
    e.target.value = '';
    if (!file) return;
    log.info('handleFileChange', 'file selected', { fileName: file.name });
    onImport(file);
  };

  return (
    <aside
      className="flex h-full w-1/4 min-w-[260px] max-w-[340px] flex-col border-r"
      role="navigation"
      aria-label="Base sidebar"
    >
      {/* Header: title + Excel import */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">Base</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleImportClick}
          disabled={isImporting}
          aria-busy={isImporting}
          aria-label="Import base entities from Excel"
        >
          {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map((group) => (
          <KindGroup
            key={group.kind}
            group={group}
            styles={stylesByKind[group.kind]}
            expanded={expandedGroups[group.kind]}
            selectedStyle={selectedStyle}
            generateOps={generateOps}
            onSelectStyle={onSelectStyle}
            onToggleGroup={onToggleGroup}
            onAddStyle={onAddStyle}
            onLockStyle={onLockStyle}
            onEditEntity={onEditEntity}
          />
        ))}
      </div>
    </aside>
  );
}

function KindGroup({
  group,
  styles,
  expanded,
  selectedStyle,
  generateOps,
  onSelectStyle,
  onToggleGroup,
  onAddStyle,
  onLockStyle,
  onEditEntity,
}: {
  group: KindGroupConfig;
  styles: SketchBaseStyle[];
  expanded: boolean;
  selectedStyle: SelectedStyleRef | null;
  generateOps: Partial<Record<BaseKind, BaseSheetGenerateOp>>;
  onSelectStyle: (kind: BaseKind, index: number) => void;
  onToggleGroup: (kind: BaseKind) => void;
  onAddStyle: (kind: BaseKind) => void;
  onLockStyle: (kind: BaseKind, index: number) => void;
  onEditEntity: (kind: BaseKind) => void;
}) {
  const { kind, title } = group;

  // Peer-lock (advisory) for THIS kind's SHEET (rtype 11) — memoize the target so the primitive
  // selectors stay subscribed to a stable object (they return primitives → Object.is-stable).
  const sheetTarget = useMemo(() => resolveSketchBaseSheetLockTarget(kind), [kind]);
  const sheetLockedByOther = useIsLockedByOther(sheetTarget);
  const sheetHolder = useLockHolderName(sheetTarget);
  const peerTip = sheetLockedByOther ? `${sheetHolder ?? 'Another editor'} is editing` : undefined;

  return (
    <div className="mb-1">
      {/* Group header: chevron+title toggle (aria-expanded) + peer badge + edit-entity + add-style */}
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
        {/* Peer-lock badge — 🔒 + holder name (never hidden; browse + ✏ stay enabled). */}
        {sheetLockedByOther && (
          <span
            className="flex min-w-0 items-center gap-0.5 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground"
            title={peerTip}
          >
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="max-w-[64px] truncate">{sheetHolder ?? 'Editing'}</span>
          </span>
        )}
        {/* ✏ = grain B (entity text, rtype 3/4) — NOT gated by the sheet lock. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEditEntity(kind)}
          aria-label={`Edit ${title.toLowerCase()} entities`}
          title={`Edit ${title.toLowerCase()} entities`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {/* ＋ = sheet acquire-seam (grain A) — greyed + click-guarded when a peer holds the sheet.
            aria-disabled (NOT the real attr) keeps it hoverable so the peer tooltip surfaces. */}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', sheetLockedByOther && 'cursor-not-allowed opacity-40')}
          aria-disabled={sheetLockedByOther}
          onClick={() => {
            if (sheetLockedByOther) return;
            onAddStyle(kind);
          }}
          aria-label={`Add ${title.toLowerCase()} style`}
          title={sheetLockedByOther ? peerTip : `Add ${title.toLowerCase()} style`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-0.5 space-y-0.5 pl-4">
          {styles.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No style yet — ＋ to generate
            </p>
          ) : (
            styles.map((style, idx) => (
              <StyleRow
                key={idx}
                index={idx}
                isLocked={style.is_selected}
                isSelected={selectedStyle?.kind === kind && selectedStyle.index === idx}
                isGenerating={generateOps[kind]?.styleIndex === idx}
                lockedByOther={sheetLockedByOther}
                peerTip={peerTip}
                onSelect={() => onSelectStyle(kind, idx)}
                onLock={() => onLockStyle(kind, idx)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StyleRow({
  index,
  isLocked,
  isSelected,
  isGenerating,
  lockedByOther,
  peerTip,
  onSelect,
  onLock,
}: {
  index: number;
  isLocked: boolean;
  isSelected: boolean;
  isGenerating: boolean;
  /** A peer holds this kind's SHEET → the 🔒 (lock-style, grain A) acquire-seam is greyed. */
  lockedByOther: boolean;
  peerTip?: string;
  onSelect: () => void;
  onLock: () => void;
}) {
  const label = `Style ${index + 1}`;
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md pr-1',
        isSelected ? 'bg-primary/10' : isLocked ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      {/* Row select = BROWSE (no lock) → always enabled, even when a peer holds the sheet. */}
      <button
        type="button"
        className={cn(
          'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm',
          isSelected && 'font-medium text-foreground',
          // Locked = the final style — primary + semibold so it reads at a glance (twMerge:
          // these win over the selected classes above).
          isLocked && 'font-semibold text-primary',
        )}
        aria-current={isSelected ? 'true' : undefined}
        onClick={onSelect}
      >
        {label}
      </button>
      {isGenerating && (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label={`${label} generating`}
        />
      )}
      {/* 🔒 lock-style = sheet acquire-seam (grain A) → greyed + click-guarded when peer-held.
          aria-disabled (NOT the real attr) keeps it hoverable so the peer tooltip surfaces. */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-6 w-6',
          // Locked = primary-tinted, filled padlock — the visual anchor of the locked style.
          isLocked ? 'text-primary hover:text-primary' : 'text-muted-foreground',
          lockedByOther && 'cursor-not-allowed opacity-40',
        )}
        aria-disabled={lockedByOther}
        onClick={() => {
          if (lockedByOther) return;
          onLock();
        }}
        aria-pressed={isLocked}
        aria-label={isLocked ? `Unlock ${label}` : `Lock ${label}`}
        title={lockedByOther ? peerTip : isLocked ? 'Locked style' : 'Lock as final style'}
      >
        {isLocked ? <Lock className="h-4 w-4 fill-primary/20" /> : <LockOpen className="h-4 w-4" />}
      </Button>
    </div>
  );
}
