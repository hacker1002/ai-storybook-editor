// Upload Sound modal — shared types & form constants.
// SPEC DEVIATION (Phase 04 Validation S1): Spec calls for 25MB cap and UUID
// filenames. We accept the helper-imposed 20MB cap (helper `uploadAudioToStorage`
// uses AUDIO_MAX_SIZE = 20MB shared with voices) and `Date.now()-{name}` filename
// scheme (collision-safe under per-userId path prefix). UUID rename deferred —
// would require helper refactor across features. Documented in plan.md §Validation Log.

export type UploadStep = 'form' | 'uploading';

export interface UploadSoundFormState {
  name: string;
  description: string;
  tags: string;
  file: File | null;
  durationMs: number | null;
  fileError: string | null;
}

export const DEFAULT_UPLOAD_FORM: UploadSoundFormState = {
  name: '',
  description: '',
  tags: '',
  file: null,
  durationMs: null,
  fileError: null,
};

// Sound spec only allows MP3/WAV/OGG. Helper allows webm/aac too — we enforce
// the stricter subset on the FE side before delegating to the helper.
export const ALLOWED_AUDIO_MIME = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const;
export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB (helper cap; spec says 25MB)
export const NAME_MAX = 255;
