// upload-audio-helpers.ts — Shared helpers for "Upload narration" flow (toolbars
// that let users attach a pre-recorded audio file instead of AI-generating).
// Extracted here so both object-space and spread-space toolbars can reuse.

/**
 * Probe audio duration via HTMLAudioElement metadata preload.
 * Returns duration in milliseconds (rounded). Resolves 0 on failure so callers
 * can still persist the upload (duration is a display-only hint for the slider).
 */
export function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.src = url;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.src = '';
    };
    el.onloadedmetadata = () => {
      const ms = Number.isFinite(el.duration)
        ? Math.round(el.duration * 1000)
        : 0;
      cleanup();
      resolve(ms);
    };
    el.onerror = () => {
      cleanup();
      resolve(0);
    };
  });
}

/** SHA-256 hex digest of a File via Web Crypto. One-shot (not in render path). */
export async function sha256HexOfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
