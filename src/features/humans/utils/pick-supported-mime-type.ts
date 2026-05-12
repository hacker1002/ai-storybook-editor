// pick-supported-mime-type.ts — Negotiate MediaRecorder codec; return first supported.

const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return '';
}
