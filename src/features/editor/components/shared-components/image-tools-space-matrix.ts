// image-tools-space-matrix.ts — Single source of truth for which image tools (Generate
// modes / Edit tools / Extract tabs) are AVAILABLE per creative space (design
// `image-tools-space-matrix.md` §4-§6). This is gate #1 (availability-in-space). Each modal
// ALSO has its own registry `enabled` flag = gate #2 (build-status).
//
// ⚡ RENDERING (UI decision 2026-06-24 — never hide): the modal headers render EVERY registry
// tab/tool/mode. A slot is fully interactive only when available-in-space AND built; otherwise
// it shows DISABLED + "Coming soon" — it is NOT removed from the header. So the two gates
// collapse to a 2-state VISUAL (active vs disabled). The classifier below still distinguishes
// `hidden` (matrix `x`) from `coming-soon` (matrix `o` + unbuilt) because they differ for
// LANDING selection — resolveInitialKey only lands on available (`o`) tabs — but both paint the
// same greyed/coming-soon button.
//
// Keys reuse the existing modal enums verbatim (no new types). Extract uses the modal's own
// keys (`background`/`lottie`, not `get_background`/`get_lottie`) so it stays type-checked
// against EXTRACT_TABS. Type-only imports → no runtime import cycle with the modal constants.

import type { GenerateModalMode } from './generate-image-modal/generate-image-modal-constants';
import type { EditToolKey } from './edit-image-modal/edit-image-modal-constants';
import type { ExtractTabKey } from './extract-image-modal/extract-image-modal-constants';

/** Creative space whose image toolbar mounts the shared Generate/Edit/Extract modals. */
export type ToolSpace = 'raw' | 'object' | 'remix';

/** Per-space availability lists (gate #1). A key present here is available-in-space; the
 *  modal registry's `enabled` flag still decides active vs coming-soon. */
export interface SpaceToolConfig {
  generate: GenerateModalMode[];
  edit: EditToolKey[];
  extract: ExtractTabKey[];
}

export const SPACE_TOOL_MATRIX: Record<ToolSpace, SpaceToolConfig> = {
  raw: {
    generate: ['upload', 'generate'],
    edit: ['inpaint', 'outpaint', 'upscale', 'remove_object', 'remove_text', 'remove_background', 'erasor'],
    extract: ['crop', 'get_text'],
  },
  object: {
    // ⚡ DIVERGENCE (matrix §10 Q2): the product matrix marks generate=o for Object, but we
    // wire UPLOAD-ONLY until GenerateImageModal is generalized to be store-agnostic. Flip to
    // ['upload','generate'] (one line) once it no longer hard-binds the illustration store.
    generate: ['upload'],
    edit: ['inpaint', 'outpaint', 'upscale', 'remove_object', 'remove_background', 'erasor'], // NO remove_text
    extract: ['segment', 'layering', 'crop', 'get_object', 'background', 'lottie'],            // NO get_text
  },
  remix: { // data ready, NOT yet wired (no editable image toolbar in RemixMainView)
    generate: ['upload'],
    edit: ['inpaint', 'upscale', 'erasor'],
    extract: [],
  },
};

// ── 2-gate resolution ──────────────────────────────────────────────────────────

export type ToolGateStatus = 'hidden' | 'coming-soon' | 'active';

/**
 * Resolve the display status of one tool key against the 2 gates.
 * @param enabledKeys availability list for the space; `undefined` = no space gate (every key
 *   available → matches legacy behavior when a modal is mounted without a per-space prop).
 * @param implemented the modal registry's build-status flag for this key.
 */
export function resolveToolGate(
  key: string,
  enabledKeys: readonly string[] | undefined,
  implemented: boolean,
): ToolGateStatus {
  const availableInSpace = enabledKeys === undefined || enabledKeys.includes(key);
  if (!availableInSpace) return 'hidden';
  if (!implemented) return 'coming-soon';
  return 'active';
}

/** Minimal registry-entry shape the initial-key resolver needs. */
interface GateRegistryEntry<K extends string> {
  key: K;
  enabled: boolean;
}

/**
 * Pick the landing tab/tool so the modal never opens into a hidden (or, when avoidable, a
 * coming-soon) slot. Priority:
 *   1. `requested ?? defaultKey` if it is available-in-space AND built;
 *   2. leftmost available-in-space AND built;
 *   3. leftmost available-in-space (coming-soon — e.g. raw Extract where all tabs are deferred);
 *   4. `defaultKey` (defensive — registry/enabledKeys produced nothing usable).
 *
 * With `enabledKeys === undefined` + `requested === undefined` this returns `defaultKey`
 * (== leftmost built entry in the shipped registries) → byte-for-byte legacy behavior.
 */
export function resolveInitialKey<K extends string>(
  registry: readonly GateRegistryEntry<K>[],
  enabledKeys: readonly K[] | undefined,
  requested: K | undefined,
  defaultKey: K,
): K {
  const available = (key: K) => enabledKeys === undefined || enabledKeys.includes(key);
  const isBuilt = (key: K) => registry.find((r) => r.key === key)?.enabled ?? false;

  const wanted = requested ?? defaultKey;
  if (available(wanted) && isBuilt(wanted)) return wanted;

  const firstBuiltAvailable = registry.find((r) => available(r.key) && r.enabled);
  if (firstBuiltAvailable) return firstBuiltAvailable.key;

  const firstAvailable = registry.find((r) => available(r.key));
  return firstAvailable ? firstAvailable.key : defaultKey;
}
