// use-undo-redo-hotkey.ts — mount ONCE at the editor root (inside InteractionLayerProvider).
// Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z = redo, routed through the global-hotkey
// channel (ADR-045 / ADR-019).
//
// Self-gate lives in `match` (NOT the handler): returning false lets the event fall through to
// the interaction-layer's slot-scoped routing, so:
//   • modal open (stack.modal !== null) → YIELD to the edit-image-modal stroke undo/redo.
//   • no active session (!activeKey)    → yield (nothing to undo here).
// When `match` returns true the provider does preventDefault + stopPropagation BEFORE its
// editable-element guard, then calls the handler only when focus is not in an input — i.e. the
// "preventDefault before editable-guard" requirement is satisfied by the provider itself.
//
// match/handler read the LATEST state via getState() (no stale closure), and are stable
// (deps = [stackRef]) so the hotkey registers exactly once.

import { useCallback } from 'react';
import { useGlobalHotkey } from '@/features/editor/contexts/use-global-hotkey';
import { useInteractionLayerContext } from '@/features/editor/contexts/interaction-layer-provider';
import { useEditHistoryStore } from '@/stores/edit-history-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useUndoRedoHotkey');

export function useUndoRedoHotkey(): void {
  const { stackRef } = useInteractionLayerContext();

  const match = useCallback(
    (e: KeyboardEvent): boolean => {
      // Yield to a modal's own stroke undo (edit-image-modal inpaint/eraser).
      if (stackRef.current.modal !== null) return false;
      // Yield when there is no held session to act on.
      if (!useEditHistoryStore.getState().activeKey) return false;
      if (!(e.ctrlKey || e.metaKey)) return false;
      const k = e.key.toLowerCase();
      return k === 'z' || k === 'y';
    },
    [stackRef],
  );

  const handler = useCallback((e: KeyboardEvent): void => {
    const store = useEditHistoryStore.getState();
    const k = e.key.toLowerCase();
    if (k === 'y' || (k === 'z' && e.shiftKey)) {
      log.info('handler', 'redo');
      store.redo();
    } else if (k === 'z') {
      log.info('handler', 'undo');
      store.undo();
    }
  }, []);

  // runInEditable: session item-undo is a global command — it must fire even when focus sits in a
  // text field (entity spaces are input-heavy; without this Ctrl+Z was swallowed there, ADR-045).
  useGlobalHotkey(match, handler, [match, handler], true);
}
