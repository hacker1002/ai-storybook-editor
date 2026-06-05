// video-worker/src/errors.ts
// Coarse error classification → HTTP status + stable code for the /render handler.
// Keeps upstream stack traces out of client responses while preserving a debuggable code.
//
// BGM degrade (SSRF block / fetch fail / over-cap) is NOT a client error — it is
// handled internally in render-book.ts, logged, and surfaced as `warnings[]` in the
// 200 response. No error code here for it.

export type RenderErrorCode =
  | "BUNDLE_FAILED"
  | "COMPOSITION_NOT_FOUND"
  | "RENDER_TIMEOUT"
  | "RENDER_FAILED"
  // /render-book specific:
  | "INVALID_INPUT"    // 400 — missing/wrong illustration or edition
  | "EMPTY_SEQUENCE"   // 422 — walker resolved 0 spreads
  | "BOOK_TOO_LARGE"   // 413 — sequence.length > MAX_BOOK_SPREADS (data guard)
  | "BUSY";            // 429 — in-flight guard (shared with /render)

export interface ClassifiedError {
  code: RenderErrorCode;
  status: number;
  message: string;
}

/** Status map for error codes raised directly by handlers (no substring match needed). */
export const ERROR_STATUS: Record<RenderErrorCode, number> = {
  INVALID_INPUT: 400,
  EMPTY_SEQUENCE: 422,
  BOOK_TOO_LARGE: 413,
  BUSY: 429,
  RENDER_TIMEOUT: 504,
  COMPOSITION_NOT_FOUND: 404,
  BUNDLE_FAILED: 500,
  RENDER_FAILED: 500,
};

export function classifyRenderError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "RENDER_TIMEOUT", status: 504, message };
  }
  if (lower.includes("no composition") || lower.includes("not found")) {
    return { code: "COMPOSITION_NOT_FOUND", status: 404, message };
  }
  if (lower.includes("bundle") || lower.includes("webpack")) {
    return { code: "BUNDLE_FAILED", status: 500, message };
  }
  return { code: "RENDER_FAILED", status: 500, message };
}
