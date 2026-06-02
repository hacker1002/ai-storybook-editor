// video-worker/src/errors.ts
// Coarse error classification → HTTP status + stable code for the /render handler.
// Keeps upstream stack traces out of client responses while preserving a debuggable code.

export type RenderErrorCode =
  | "BUNDLE_FAILED"
  | "COMPOSITION_NOT_FOUND"
  | "RENDER_TIMEOUT"
  | "RENDER_FAILED";

export interface ClassifiedError {
  code: RenderErrorCode;
  status: number;
  message: string;
}

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
