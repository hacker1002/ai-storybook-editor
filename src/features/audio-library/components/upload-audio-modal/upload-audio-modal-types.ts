// Upload Audio modal — shared form state types.

export type UploadStep = 'form' | 'uploading';

export interface UploadAudioFormState {
  name: string;
  description: string;
  tags: string;
  loop: boolean;
  file: File | null;
  durationMs: number | null;
  fileError: string | null;
}

export const DEFAULT_UPLOAD_FORM: UploadAudioFormState = {
  name: '',
  description: '',
  tags: '',
  loop: false,
  file: null,
  durationMs: null,
  fileError: null,
};

export const NAME_MAX = 255;
