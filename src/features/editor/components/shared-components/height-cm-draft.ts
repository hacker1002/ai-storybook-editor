// height-cm-draft.ts — RAW draft <-> store conversions + validation for the HEIGHT (CM) field.
// Kept apart from `height-cm-field.tsx` because the repo lints react-refresh/only-export-components
// as an ERROR (a component file may export components only).
//
// The modals hold height as a RAW STRING ("" | "110"), never a number:
//  - "" = the user cleared it → an EXPLICIT null on Save (null = xoá, undefined = giữ).
//  - seeding via `heightToDraft` (String(x ?? '')) keeps the stored number 110 and the draft "110"
//    comparable, so a freshly-opened modal is never falsely dirty.
//  - validity is DERIVED at render (`isHeightDraftValid`) — React 19 in this repo lints
//    set-state-in-effect as an error, so validation must never be mirrored into state.

// Bounds come from the parser so modal validation and import clamping can never drift apart.
export { HEIGHT_CM_MIN, HEIGHT_CM_MAX } from '@/utils/parse-height-cm';

import { HEIGHT_CM_MIN, HEIGHT_CM_MAX } from '@/utils/parse-height-cm';

const HEIGHT_INT_RE = /^\d+$/;

/** Empty (→ null) or an integer in [1, 5000]. Anything else blocks Save. */
export function isHeightDraftValid(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  if (!HEIGHT_INT_RE.test(trimmed)) return false;
  const n = Number(trimmed);
  return n >= HEIGHT_CM_MIN && n <= HEIGHT_CM_MAX;
}

/** Stored number → RAW draft string. `String(x ?? '')` so 110 seeds as "110" (no false dirty). */
export function heightToDraft(height: number | null | undefined): string {
  return String(height ?? '');
}

/** RAW draft string → the store payload value; empty = an explicit null (clear the height). */
export function heightDraftToPayload(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : parseInt(trimmed, 10);
}
