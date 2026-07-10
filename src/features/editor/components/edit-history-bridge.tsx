// edit-history-bridge.tsx — headless mount for the undo/redo edit-history feature (ADR-045).
// Renders nothing; exists solely to run the capture subscription + the global undo/redo hotkey
// at the editor root. MUST be mounted INSIDE InteractionLayerProvider (the hotkey hook reads
// the interaction-layer stack for its modal self-gate).

import { useEditHistoryCapture } from '../hooks/use-edit-history-capture';
import { useUndoRedoHotkey } from '../hooks/use-undo-redo-hotkey';

export function EditHistoryBridge(): null {
  useEditHistoryCapture();
  useUndoRedoHotkey();
  return null;
}

export default EditHistoryBridge;
