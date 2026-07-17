// sketch-consent-storage.ts — remembers ACCEPTED sketch-reset consents across reloads (ADR-047
// phase-03, D11). localStorage holds ONLY 'accept' decisions: a refusal is session-only by design
// (every reload re-asks — a deliberate strong reminder that the resource is still degraded).
//
// Key = sketch-consent:{snapshotId}:{resourceKey}:{sig} where `sig` is a short content hash of
// the quarantined raw blob — a CHANGED blob changes the key, so a new corruption re-asks even on
// a resource the user consented for before. Only decisions are stored, never data.

import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'SketchConsentStorage');

const ACCEPT = 'accept';

/** Short stable content hash (FNV-1a over JSON, base36). Collisions only risk re-asking or
 *  skipping a re-ask for an identical-looking blob — never data loss (the decision only reopens
 *  the save path). Unserializable input (throwing getters, cycles) hashes to a constant. */
export function sigOf(raw: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(raw) ?? 'undefined';
  } catch {
    return 'unhashable';
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Storage key for one (snapshot, resource, blob) consent decision. */
export function consentKey(snapshotId: string | null, resource: string, sig: string): string {
  return `sketch-consent:${snapshotId ?? 'unknown'}:${resource}:${sig}`;
}

/** True when the user already ACCEPTED the reset behind `key` (any earlier session). */
export function readAccepted(key: string): boolean {
  try {
    return localStorage.getItem(key) === ACCEPT;
  } catch (err) {
    // Storage unavailable (private mode / quota) → treat as never-consented (fail-safe: re-ask).
    log.warn('readAccepted', 'localStorage unavailable — treating as not consented', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Persist an ACCEPT decision. There is deliberately NO refuse writer (D11). */
export function writeAccepted(key: string): void {
  try {
    localStorage.setItem(key, ACCEPT);
    log.debug('writeAccepted', 'consent persisted', { key });
  } catch (err) {
    // Best-effort: losing the memo only means the modal re-asks next load.
    log.warn('writeAccepted', 'localStorage write failed — consent is session-only this time', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
