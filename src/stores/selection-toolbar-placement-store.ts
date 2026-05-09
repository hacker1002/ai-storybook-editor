// selection-toolbar-placement-store.ts
// Bridges the toolbar's resolved placement (above/below/left/right) to the
// SelectionFrame so it can flip the rotate handle stem to the OPPOSITE side
// — otherwise the toolbar overlaps and swallows the rotate handle.

import { create } from 'zustand';
import type { ToolbarPosition } from '@/features/editor/hooks/use-toolbar-position';

type Placement = ToolbarPosition['placement'];

interface SelectionToolbarPlacementStore {
  placement: Placement | null;
  setPlacement: (placement: Placement | null) => void;
}

export const useSelectionToolbarPlacementStore = create<SelectionToolbarPlacementStore>((set) => ({
  placement: null,
  setPlacement: (placement) => set({ placement }),
}));
