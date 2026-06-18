// generate-image-modal-constants.ts — Mode/model/edge/zoom/upload constants for the
// full-screen "Creating Image" workspace (design generate-image-modal.md §2.2).
// Layout tokens + dark theme + z-index are REUSED from the swap modal (design §4.1/4.3),
// so this module only carries the generate-modal-specific option lists + numeric ranges.

/** Workspace mode — Generate (AI) vs Upload (no-AI). Header tablist switches it. */
export type GenerateModalMode = 'generate' | 'upload';

/** Model options (right sidebar, allowlist group `scene`). ⚡v1 Gemini-only — non-Gemini
 *  models are NOT_SUPPORTED backend (→422 UNSUPPORTED_MODEL), so we don't list dead options.
 *  Forwarded as `modelParams: { model }` (07-generate-scene). */
export const MODEL_OPTIONS = ['google/nano-banana-pro'] as const;
export const DEFAULT_MODEL = 'google/nano-banana-pro';

/** Edge treatment options — rendered as an icon grid (5 cells), NOT a <Select>.
 *  ⚡WIRED: the picked value is forwarded to generate as `edgeTreatment`; v1 backend
 *  validates + echoes meta (output unchanged / no-op). Real post-process is deferred. */
export const EDGE_TREATMENT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'faded', label: 'Faded' },
  { value: 'cutout', label: 'Cutout' },
  { value: 'geometric', label: 'Geometric' },
  { value: 'stroke', label: 'Stroke' },
] as const;

export const DEFAULT_EDGE_TREATMENT = 'none';

/** Canvas zoom range (% applied as image width/height scale — NOT transform:scale, so
 *  scroll metrics stay accurate). Modal-local: differs from the swap modal's `min:10`. */
export const ZOOM = { min: 50, max: 400, step: 5, default: 100 } as const;

/** Upload-mode file gate (Upload picker + canvas dropzone). Storage applies its own hard
 *  caps (10MB + normalize); this is the fast client-side pre-check. */
export const UPLOAD = { accept: 'image/png,image/jpeg,image/webp', maxSizeMB: 20 } as const;
