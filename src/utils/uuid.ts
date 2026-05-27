// uuid.ts — Single source for client-side UUID generation. Prefers the native
// `crypto.randomUUID` (available in secure browser contexts); falls back to a
// timestamp+random token when unavailable (non-HTTPS / very old runtimes).
// Shared by remix batch ids, human-api, etc. so the fallback never drifts.

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
