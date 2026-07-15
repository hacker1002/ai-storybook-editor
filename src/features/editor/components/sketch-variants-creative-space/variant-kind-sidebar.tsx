// variant-kind-sidebar.tsx — left sidebar of SketchVariantsSpace (design 01). Header "Variants"
// (title only — NO Excel import; variants are seeded from the Base space import). Two collapsible
// groups (Character / Prop), each listing every NON-BASE variant as a row: mention label (select) +
// ✏ (edit text) + ✨ (generate raw sheet) / spinner while busy. Rows are read-only (no add/delete).
//
// Generate is GATED (gateByRef → 3 reasons). Gated-off ✨ renders DISABLED + tooltip, never hidden
// (memory: never-hide-disabled-ui). While the row's op is busy, ✨ becomes an inert spinner.

import { ChevronDown, ChevronRight, Loader2, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BaseKind, VariantRef } from '@/types/sketch';
import { cn } from '@/utils/utils';
import {
  GATE_TOOLTIP,
  sameRef,
  type KindGroupConfig,
  type VariantGate,
  type VariantGenStatus,
} from './sketch-variants-constants';

interface VariantKindSidebarProps {
  groups: KindGroupConfig[];
  refsByKind: Record<BaseKind, VariantRef[]>;
  selectedVariant: VariantRef | null;
  expandedGroups: Record<BaseKind, boolean>;
  genStatusByRef: (ref: VariantRef) => VariantGenStatus;
  gateByRef: (ref: VariantRef) => VariantGate;
  onSelect: (ref: VariantRef) => void;
  onToggleGroup: (kind: BaseKind) => void;
  onEditVariant: (ref: VariantRef) => void;
  onGenerate: (ref: VariantRef) => void;
}

export function VariantKindSidebar({
  groups,
  refsByKind,
  selectedVariant,
  expandedGroups,
  genStatusByRef,
  gateByRef,
  onSelect,
  onToggleGroup,
  onEditVariant,
  onGenerate,
}: VariantKindSidebarProps) {
  return (
    <aside
      className="flex h-full w-1/4 min-w-[260px] max-w-[340px] flex-col border-r"
      role="navigation"
      aria-label="Variants sidebar"
    >
      {/* Header: title only — variants are NOT imported here (seeded from the Base space). */}
      <div className="flex h-11 shrink-0 items-center border-b px-3">
        <span className="text-sm font-semibold">Variants</span>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto p-2" role="tree" aria-label="Variants">
        {groups.map((group) => (
          <VariantGroup
            key={group.kind}
            group={group}
            refs={refsByKind[group.kind]}
            expanded={expandedGroups[group.kind]}
            selectedVariant={selectedVariant}
            genStatusByRef={genStatusByRef}
            gateByRef={gateByRef}
            onSelect={onSelect}
            onToggleGroup={onToggleGroup}
            onEditVariant={onEditVariant}
            onGenerate={onGenerate}
          />
        ))}
      </div>
    </aside>
  );
}

function VariantGroup({
  group,
  refs,
  expanded,
  selectedVariant,
  genStatusByRef,
  gateByRef,
  onSelect,
  onToggleGroup,
  onEditVariant,
  onGenerate,
}: {
  group: KindGroupConfig;
  refs: VariantRef[];
  expanded: boolean;
  selectedVariant: VariantRef | null;
  genStatusByRef: (ref: VariantRef) => VariantGenStatus;
  gateByRef: (ref: VariantRef) => VariantGate;
  onSelect: (ref: VariantRef) => void;
  onToggleGroup: (kind: BaseKind) => void;
  onEditVariant: (ref: VariantRef) => void;
  onGenerate: (ref: VariantRef) => void;
}) {
  const { kind, title } = group;

  return (
    <div className="mb-1" role="group">
      {/* Group header: chevron + title toggle (aria-expanded). */}
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
          {refs.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No variant — import in the Base space
            </p>
          ) : (
            refs.map((ref) => (
              <VariantRow
                key={`${ref.entityKey}/${ref.variantKey}`}
                variantRef={ref}
                isSelected={sameRef(selectedVariant, ref)}
                status={genStatusByRef(ref)}
                gate={gateByRef(ref)}
                onSelect={onSelect}
                onEditVariant={onEditVariant}
                onGenerate={onGenerate}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function VariantRow({
  variantRef,
  isSelected,
  status,
  gate,
  onSelect,
  onEditVariant,
  onGenerate,
}: {
  variantRef: VariantRef;
  isSelected: boolean;
  status: VariantGenStatus;
  gate: VariantGate;
  onSelect: (ref: VariantRef) => void;
  onEditVariant: (ref: VariantRef) => void;
  onGenerate: (ref: VariantRef) => void;
}) {
  const mention = `@${variantRef.entityKey}/${variantRef.variantKey}`;
  const spinnerLabel = status.phase === 'cut' ? 'Cutting cells…' : 'Generating…';
  const gateTooltip = gate.reason ? GATE_TOOLTIP[gate.reason] : undefined;

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md pr-1',
        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        className={cn(
          'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm',
          isSelected && 'font-medium text-foreground',
        )}
        aria-current={isSelected ? 'true' : undefined}
        title={mention}
        onClick={() => onSelect(variantRef)}
      >
        {mention}
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground"
        onClick={() => onEditVariant(variantRef)}
        aria-label={`Edit ${mention}`}
        title={`Edit ${mention}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      {status.isBusy ? (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center"
          role="status"
          aria-live="polite"
          title={spinnerLabel}
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={spinnerLabel} />
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          // aria-disabled (NOT the real `disabled` attr): shadcn's `disabled:pointer-events-none`
          // would make a real-disabled button transparent to hover → the gate-reason tooltip would
          // never surface. Mirror edit-image-modal-header — greyed via explicit classes + click-guard
          // so the WHY (no-art-style / base-not-ready / empty-text) stays discoverable (never-hide-ui).
          className={cn(
            'h-6 w-6 text-muted-foreground',
            !gate.canGenerate && 'cursor-not-allowed opacity-40',
          )}
          aria-disabled={!gate.canGenerate}
          aria-busy={status.isBusy}
          onClick={() => {
            if (!gate.canGenerate) return;
            onGenerate(variantRef);
          }}
          aria-label={`Generate ${mention} sheet`}
          title={gate.canGenerate ? `Generate ${mention} sheet` : gateTooltip}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
