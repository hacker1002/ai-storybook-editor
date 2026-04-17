// aspect-ratio-constants.ts
// Single source of truth for supported image aspect ratios across the app.
// Order: portrait → landscape — must match server RATIO_VALUES in edge function
// `image-normalize-ratio`. Changing this order or set requires a coordinated
// edge-function update.

export type AspectRatio =
  | '9:16'
  | '2:3'
  | '3:4'
  | '4:5'
  | '1:1'
  | '5:4'
  | '4:3'
  | '3:2'
  | '16:9'
  | '21:9';

export interface AspectRatioOption {
  label: AspectRatio;
  value: AspectRatio;
  numeric: number;
}

export const ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { label: '9:16', value: '9:16', numeric: 9 / 16 },
  { label: '2:3',  value: '2:3',  numeric: 2 / 3 },
  { label: '3:4',  value: '3:4',  numeric: 3 / 4 },
  { label: '4:5',  value: '4:5',  numeric: 4 / 5 },
  { label: '1:1',  value: '1:1',  numeric: 1 },
  { label: '5:4',  value: '5:4',  numeric: 5 / 4 },
  { label: '4:3',  value: '4:3',  numeric: 4 / 3 },
  { label: '3:2',  value: '3:2',  numeric: 3 / 2 },
  { label: '16:9', value: '16:9', numeric: 16 / 9 },
  { label: '21:9', value: '21:9', numeric: 21 / 9 },
] as const;

export const DEFAULT_ASPECT_RATIO: AspectRatio = '1:1';

// 9:16 = 0.5625 — matches server ImageTooTallError threshold
export const MIN_SUPPORTED_RATIO = 9 / 16;

// Looser than server 1e-6 to skip round-trip for near-exact user images
export const EXACT_MATCH_TOLERANCE = 0.005;
