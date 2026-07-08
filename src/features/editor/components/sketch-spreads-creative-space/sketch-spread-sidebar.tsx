// sketch-spread-sidebar.tsx — left rail of the sketch-spread creative space.
// Header (check-all + title + Excel import) + a drag-reorderable spread list with TWO
// distinct selections (mirrors the entity sibling): row-select = canvas focus (single),
// checkbox = bulk selection (multi). Per-row page-type icon marks single vs double-page.
// NO manual "add" — import (.xlsx) is the only way to append spreads.
// Reorder = native HTML5 drag-and-drop, index-based (no extractable hook / no new dep;
// handler shape copied from canvas-spread-view/spread-thumbnail-list.tsx).

import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, GripVertical, Pencil, Trash2, BookOpen, FileText, Clock, Check, AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useSketchSpreadById, useSketchSpreadGenerating } from '@/stores/snapshot-store/selectors';
import {
  useIsSpreadLockedByOther,
  useLockHolderName,
  type LockTarget,
} from '@/stores/resource-lock-store';
import { getSketchSpreadEffectiveUrl } from '@/types/sketch';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchSpreadSidebar');

export interface SketchSpreadSidebarProps {
  spreadIds: string[];
  selectedSpreadId: string | null;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onCheck: (id: string, next: boolean) => void;
  onCheckAll: (next: boolean) => void;
  onReorder: (from: number, to: number) => void; // index-based
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: (file: File) => void;
  isImporting: boolean;
}

export function SketchSpreadSidebar({
  spreadIds,
  selectedSpreadId,
  checkedIds,
  onSelect,
  onCheck,
  onCheckAll,
  onReorder,
  onEdit,
  onDelete,
  onImport,
  isImporting,
}: SketchSpreadSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tri-state check-all: none / some (indeterminate dash) / all. Clicking selects all
  // when not-all (checked=false → next=true), clears when all.
  const allChecked = spreadIds.length > 0 && checkedIds.length === spreadIds.length;
  const someChecked = checkedIds.length > 0 && !allChecked;

  // Native HTML5 drag-drop state (id-based; index resolved at commit time so the
  // reorder survives concurrent list changes).
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the SAME file still fires onChange.
    e.target.value = '';
    if (!file) {
      log.debug('handleFileChange', 'no file selected');
      return;
    }
    log.info('handleFileChange', 'file selected', { fileName: file.name });
    onImport(file);
  };

  // --- Drag-and-drop reorder -------------------------------------------------

  const resetDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  const handleDragStart = (id: string) => {
    log.debug('handleDragStart', 'begin drag', { id });
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault(); // allow drop
    if (id !== draggedId) setDropTargetId(id);
  };

  // onDrop is the primary commit path (fires because onDragOver preventDefaults).
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedId && dropTargetId && draggedId !== dropTargetId) {
      const from = spreadIds.indexOf(draggedId);
      const to = spreadIds.indexOf(dropTargetId);
      log.info('handleDrop', 'reorder', { from, to });
      onReorder(from, to);
    } else {
      log.debug('handleDrop', 'no-op drop', {
        hasDragged: !!draggedId,
        hasTarget: !!dropTargetId,
      });
    }
    resetDrag();
  };

  // Cleanup only — if the drop lands outside a valid target, onDrop never fires
  // but onDragEnd always does, so clear the transient highlight state here.
  const handleDragEnd = () => {
    if (draggedId || dropTargetId) resetDrag();
  };

  return (
    <aside
      className="flex flex-col h-full border-r min-w-[240px] max-w-[320px] w-1/4"
      role="navigation"
      aria-label="Spreads sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-11 px-3 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            checked={allChecked}
            indeterminate={someChecked}
            disabled={spreadIds.length === 0}
            onCheckedChange={onCheckAll}
            aria-label="Select all spreads"
          />
          <span className="text-sm font-semibold truncate">Spreads</span>
          <span className="text-xs text-muted-foreground">{spreadIds.length}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleImportClick}
          disabled={isImporting}
          aria-label="Import spreads from Excel"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* List */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-2 space-y-1',
          isImporting && 'opacity-50 pointer-events-none',
        )}
        role="list"
        aria-label="Spread list"
      >
        {spreadIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-sm text-muted-foreground mb-2">No spreads yet</p>
            <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
              <FileSpreadsheet className="h-3 w-3 mr-1" /> Import Excel
            </Button>
          </div>
        ) : (
          spreadIds.map((id, index) => (
            <SketchSpreadListItem
              key={id}
              spreadId={id}
              ordinal={index + 1} // 1-based position; re-indexes on reorder (no schema field)
              isSelected={id === selectedSpreadId}
              isChecked={checkedIds.includes(id)}
              isDragged={id === draggedId}
              isDropTarget={id === dropTargetId}
              onSelect={() => onSelect(id)}
              onCheck={(next) => onCheck(id, next)}
              onEdit={() => onEdit(id)}
              onDelete={() => onDelete(id)}
              onDragStart={() => handleDragStart(id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>
    </aside>
  );
}

// -----------------------------------------------------------------------------
// List item — one spread row. Reads its own spread via id-based selector so a
// sibling edit doesn't re-render the whole list. Kept inline (file < 500 lines).
// -----------------------------------------------------------------------------

interface SketchSpreadListItemProps {
  spreadId: string;
  ordinal: number;
  isSelected: boolean;
  isChecked: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onCheck: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SketchSpreadListItem({
  spreadId,
  ordinal,
  isSelected,
  isChecked,
  isDragged,
  isDropTarget,
  onSelect,
  onCheck,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SketchSpreadListItemProps) {
  const spread = useSketchSpreadById(spreadId);
  const gen = useSketchSpreadGenerating(spreadId); // per-row generate status (primitives; useShallow-safe)

  // Edit-lock grey-out (advisory): the spread's structural lock (type 6) OR any child
  // IMAGE lock (type 1) held by another editor disables reorder/✏/🗑 + shows a 🔒 badge.
  // Selector returns a boolean → stable under Object.is despite `childImageIds` being a
  // fresh array each render. (Textbox locks are click-time-guarded in the delete flow.)
  const childImageIds = useMemo(() => spread?.images.map((im) => im.id) ?? [], [spread]);
  const lockedByOther = useIsSpreadLockedByOther(spreadId, childImageIds);
  const spreadLockTarget = useMemo<LockTarget>(
    () => ({ step: 1, resource_type: 6, resource_id: spreadId, locale: null }),
    [spreadId],
  );
  const holderName = useLockHolderName(spreadLockTarget);
  const lockTooltip = `${holderName ?? 'another editor'} is editing`;

  // Selector may return undefined mid-delete/mid-load — skip the row.
  if (!spread) {
    log.debug('SketchSpreadListItem', 'spread not found', { spreadId });
    return null;
  }

  const label = `Spread ${ordinal}`;
  const effectiveUrl = getSketchSpreadEffectiveUrl(spread);
  // Icon reflects page COUNT (visual metaphor): 2 pages (left+right) = open book;
  // 1 page = full-bleed DPS, one image across the spread = single sheet.
  const isTwoPage = spread.pages.length === 2;
  const pageTypeLabel = isTwoPage ? 'Two-page spread' : 'Single-page spread';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors cursor-pointer',
        isSelected ? 'bg-accent border-accent' : 'bg-card hover:bg-accent/50',
        isDragged && 'opacity-50',
        isDropTarget && 'border-t-2 border-t-primary', // drop indicator
      )}
      role="listitem"
      aria-current={isSelected}
      onClick={onSelect}
      draggable={!lockedByOther}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle — visual affordance (whole row is draggable); disabled + greyed
          while locked by another editor (reorder acquires this spread's type-6 lock). */}
      <GripVertical
        className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground',
          lockedByOther ? 'opacity-40 cursor-not-allowed' : 'cursor-grab',
        )}
        aria-hidden
      />

      {/* Bulk-select checkbox — isolate its toggle from row-select (focus) */}
      <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isChecked} onCheckedChange={onCheck} aria-label={`Select ${label}`} />
      </span>

      {/* Thumbnail — scaled preview or neutral placeholder when no media */}
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded-sm border bg-muted">
        {effectiveUrl ? (
          <img
            src={effectiveUrl}
            alt={label}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-muted" aria-hidden />
        )}
      </div>

      {/* Page-type indicator — two-page (left+right, open book) vs full-bleed DPS (single sheet) */}
      <span className="shrink-0 text-muted-foreground" title={pageTypeLabel} aria-label={pageTypeLabel}>
        {isTwoPage ? (
          <BookOpen className="h-4 w-4" aria-hidden />
        ) : (
          <FileText className="h-4 w-4" aria-hidden />
        )}
      </span>

      {/* Per-row generate status — only rendered while a spread-image job touches this row
          (idle = no icon, thumbnail alone). */}
      {gen.status !== 'idle' && (
        <span className="shrink-0" title={`Generation: ${gen.status}`} aria-label={`Generation ${gen.status}`}>
          {gen.status === 'running' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          ) : gen.status === 'completed' ? (
            <Check className="h-4 w-4 text-green-600" aria-hidden />
          ) : gen.status === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </span>
      )}

      {/* Label */}
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={onSelect}
        aria-current={isSelected}
      >
        <span className="text-sm font-medium truncate block">{label}</span>
      </button>

      {/* Locked-by-other badge — always visible (advisory); tooltip names the holder */}
      {lockedByOther && (
        <span
          className="shrink-0 flex items-center text-muted-foreground"
          title={lockTooltip}
          onClick={(e) => e.stopPropagation()}
        >
          <Lock className="h-3.5 w-3.5" aria-label={lockTooltip} />
        </span>
      )}

      {/* Edit — visible on hover/focus; disabled + greyed when locked by another editor */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'h-6 w-6 transition-opacity shrink-0',
          lockedByOther ? 'opacity-40' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        disabled={lockedByOther}
        title={lockedByOther ? lockTooltip : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Edit ${label}`}
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
              lockedByOther ? 'opacity-40' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
            disabled={lockedByOther}
            title={lockedByOther ? lockTooltip : undefined}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Delete ${label}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete spread</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{label}&rdquo;? This action cannot be undone.
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
