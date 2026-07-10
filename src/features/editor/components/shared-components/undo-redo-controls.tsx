// undo-redo-controls.tsx — shared Undo2 / Redo2 pill for the per-spread / per-entity edit
// session (ADR-045). Reused by the scene, retouch and entity creative spaces (one mount per
// space). Reads the GLOBAL active session (only one creative space is visible at a time, so
// activeKey is that space's session or null). NEVER hidden — the buttons stay rendered and go
// DISABLED when there is nothing to undo/redo (memory: never hide disabled UI).

import { Undo2, Redo2 } from 'lucide-react';
import { ToolbarIconButton } from '@/features/editor/components/shared-components';
import { useEditHistoryStore, useCanUndo, useCanRedo } from '@/stores/edit-history-store';
import { cn } from '@/utils/utils';

interface UndoRedoControlsProps {
  /** Positioning / layout classes supplied by the host space (e.g. absolute top-3 right-3 z-10). */
  className?: string;
}

export function UndoRedoControls({ className }: UndoRedoControlsProps) {
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  // Stable method refs (Object.is) — no useShallow, no re-render churn.
  const undo = useEditHistoryStore((s) => s.undo);
  const redo = useEditHistoryStore((s) => s.redo);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1.5 py-0.5 shadow-sm select-none',
        className,
      )}
    >
      <ToolbarIconButton icon={Undo2} label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo} />
      <ToolbarIconButton icon={Redo2} label="Redo (Ctrl/Cmd+Y)" onClick={redo} disabled={!canRedo} />
    </div>
  );
}

export default UndoRedoControls;
