// crop-sheet-build-state.ts — Selector hook reading the ephemeral per-remix
// crop-sheet build task. Split from index.ts to keep that file from growing;
// the `buildCropSheets` action stays in index.ts (needs the set/get closure).

import { useShallow } from 'zustand/react/shallow';
import { useRemixStore } from './index';
import type { CropSheetBuildStatus } from '@/types/remix';

/** Stable idle reference — avoids a fresh object on the default path, which
 *  would defeat the selector re-render guard. */
const IDLE: CropSheetBuildStatus = { state: 'idle' };

/** Reactive read of the build task for one remix. Defaults to a stable idle
 *  object. useShallow keeps parity with useAudioJobBadgeState and guards
 *  against React 19's infinite-snapshot bail-out on object-returning selectors. */
export function useCropSheetBuildState(remixId: string): CropSheetBuildStatus {
  return useRemixStore(
    useShallow((s) => s.cropSheetBuildTasks[remixId] ?? IDLE),
  );
}
