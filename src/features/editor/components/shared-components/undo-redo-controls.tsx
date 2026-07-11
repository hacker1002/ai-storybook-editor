// undo-redo-controls.tsx — shared Undo2 / Redo2 pill for the per-spread / per-entity edit
// session (ADR-045). Mounted ONCE in the global editor header. Reads the GLOBAL active session
// (only one creative space is visible at a time, so activeKey is that space's session or null):
// the pill LIGHTS UP while a session is held (activeKey set) and DIMS when idle / outside a collab
// space. NEVER hidden — the buttons stay rendered and go DISABLED when there is nothing to
// undo/redo (memory: never hide disabled UI).

import { Undo2, Redo2 } from 'lucide-react';
import { ToolbarIconButton } from '@/features/editor/components/shared-components';
import { useEditHistoryStore, useCanUndo, useCanRedo, useActiveHistoryKey } from '@/stores/edit-history-store';
import { cn } from '@/utils/utils';

interface UndoRedoControlsProps {
  /** Extra layout classes from the host (optional — the header mounts it with defaults). */
  className?: string;
}

export function UndoRedoControls({ className }: UndoRedoControlsProps) {
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  // Active held session → pill is "live"; null → dim it (nothing editable to undo/redo).
  const active = useActiveHistoryKey() != null;
  // Stable method refs (Object.is) — no useShallow, no re-render churn.
  const undo = useEditHistoryStore((s) => s.undo);
  const redo = useEditHistoryStore((s) => s.redo);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1.5 py-0.5 shadow-sm select-none transition-opacity',
        !active && 'opacity-50',
        className,
      )}
    >
      <ToolbarIconButton icon={Undo2} label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo} />
      <ToolbarIconButton icon={Redo2} label="Redo (Ctrl/Cmd+Y)" onClick={redo} disabled={!canRedo} />
    </div>
  );
}

export default UndoRedoControls;
