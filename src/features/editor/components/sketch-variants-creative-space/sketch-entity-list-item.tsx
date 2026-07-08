// sketch-entity-list-item.tsx — one row in the sketch entity sidebar.
// Reads its own entity (id-based selector → no re-render on sibling edits).
// Layout: [checkbox] [titleCase name + @key + variant count] [edit] [delete-confirm].

import { useMemo } from 'react';
import { Pencil, Trash2, Loader2, MoreHorizontal, AlertTriangle, Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useSketchEntityByKey, useSketchEntityGenerating } from '@/stores/snapshot-store/selectors';
import {
  useIsLockedByOther,
  useLockHolderName,
  type LockTarget,
} from '@/stores/resource-lock-store';
import type { SketchEntityKind } from '@/types/sketch';
import { KIND_TO_RESOURCE_TYPE, titleCase } from './sketch-variants-constants';
import { cn } from '@/utils/utils';

interface SketchEntityListItemProps {
  kind: SketchEntityKind;
  entityKey: string;
  noun: string;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onCheck: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SketchEntityListItem({
  kind,
  entityKey,
  noun,
  isSelected,
  isChecked,
  onSelect,
  onCheck,
  onEdit,
  onDelete,
}: SketchEntityListItemProps) {
  const entity = useSketchEntityByKey(kind, entityKey);
  const gen = useSketchEntityGenerating(kind, entityKey);
  const variantCount = entity?.variants.length ?? 0;
  const name = titleCase(entityKey);

  // Edit-lock grey-out (advisory): another editor holding this entity's lock disables
  // ✏/🗑 + shows a 🔒 badge with the holder's name. Row body still focus-previews
  // (focus ≠ lock — SRS §4.3). Structural delete guard is phase 07; here we only disable.
  const lockTarget = useMemo<LockTarget>(
    () => ({ step: 1, resource_type: KIND_TO_RESOURCE_TYPE[kind], resource_id: entityKey, locale: null }),
    [kind, entityKey],
  );
  const lockedByOther = useIsLockedByOther(lockTarget);
  const holderName = useLockHolderName(lockTarget);
  const lockTooltip = `${holderName ?? 'another editor'} is editing`;

  // Per-row job status: queued (⋯) / running (spinner) / error (⚠). Idle + completed render
  // nothing (the generated image itself is the "done" signal in the preview).
  const statusIcon =
    gen.status === 'running' ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label={`Generating ${name}`} />
    ) : gen.status === 'pending' ? (
      <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" aria-label={`${name} queued`} />
    ) : gen.status === 'error' ? (
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label={`${name} failed`} />
    ) : null;

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors cursor-pointer',
        isSelected ? 'bg-accent border-accent' : 'bg-card hover:bg-accent/50',
      )}
      role="listitem"
      onClick={onSelect}
    >
      {/* Isolate checkbox toggle from row-select (checkbox = bulk selection, row = focus) */}
      <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isChecked} onCheckedChange={onCheck} aria-label={`Select ${name}`} />
      </span>
      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="block w-full text-left"
          onClick={onSelect}
          aria-current={isSelected}
        >
          <span className="text-sm font-medium truncate block">{name}</span>
          <span className="text-xs text-muted-foreground">
            @{entityKey} · {variantCount} variant{variantCount === 1 ? '' : 's'}
          </span>
        </button>
      </div>

      {/* Per-row generate status — reserves no layout when idle (null) */}
      {statusIcon && (
        <span
          className="shrink-0 flex items-center"
          title={gen.status === 'error' ? gen.error : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {statusIcon}
        </span>
      )}

      {/* Locked-by-other badge — always visible (advisory), tooltip names the holder */}
      {lockedByOther && (
        <span
          className="shrink-0 flex items-center text-muted-foreground"
          title={lockTooltip}
          onClick={(e) => e.stopPropagation()}
        >
          <Lock className="h-3.5 w-3.5" aria-label={lockTooltip} />
        </span>
      )}

      {/* Edit variants — visible on hover; disabled + greyed when locked by another editor */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-6 w-6 transition-opacity shrink-0',
          lockedByOther ? 'opacity-40' : 'opacity-0 group-hover:opacity-100',
        )}
        disabled={lockedByOther}
        title={lockedByOther ? lockTooltip : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Edit ${name} variants`}
      >
        <Pencil className="h-3 w-3" />
      </Button>

      {/* Delete — confirm via AlertDialog; disabled when locked by another editor */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 transition-opacity shrink-0 text-destructive hover:text-destructive',
              lockedByOther ? 'opacity-40' : 'opacity-0 group-hover:opacity-100',
            )}
            disabled={lockedByOther}
            title={lockedByOther ? lockTooltip : undefined}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {noun}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{name}&rdquo;? This removes all its variants.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
