// State machine + reducer types cho GenerateSoundModal.
//   idle       — form only, no result yet
//   generating — awaiting BE response; form disabled, dismiss hard-blocked
//   audition   — single-result row rendered; form editable, dismiss allowed
//   saving     — awaiting supabase INSERT; form disabled, dismiss soft-blocked
export type GenerateSoundStep = 'idle' | 'generating' | 'audition' | 'saving';

export interface GenerateSoundFormState {
  name: string;
  tags: string;
  description: string;
  loop: boolean;
  durationAuto: boolean;
  durationSecs: number | null;
  promptInfluence: number;
}

export const DEFAULT_GENERATE_SOUND_FORM: GenerateSoundFormState = {
  name: '',
  tags: '',
  description: '',
  loop: false,
  durationAuto: true,
  durationSecs: null,
  promptInfluence: 0.3,
};

export interface SoundGenerationResult {
  soundUrl: string;
  durationSecs: number;
  mediaType: 'audio/mpeg' | 'audio/wav';
}

export interface ModalError {
  code: string;
  message: string;
}

export interface GenerateSoundModalState {
  step: GenerateSoundStep;
  form: GenerateSoundFormState;
  result: SoundGenerationResult | null;
  error: ModalError | null;
  showFormValidation: boolean;
}

export type GenerateSoundModalAction =
  | { type: 'SET_FORM'; form: GenerateSoundFormState }
  | { type: 'SHOW_VALIDATION' }
  | { type: 'GENERATE_START' }
  | { type: 'GENERATE_SUCCESS'; result: SoundGenerationResult }
  | { type: 'GENERATE_FAILURE'; error: ModalError; rollbackTo: 'idle' | 'audition' }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_FAILURE'; error: ModalError }
  | { type: 'CLEAR_ERROR' };

export const INITIAL_GENERATE_SOUND_STATE: GenerateSoundModalState = {
  step: 'idle',
  form: DEFAULT_GENERATE_SOUND_FORM,
  result: null,
  error: null,
  showFormValidation: false,
};

export function generateSoundModalReducer(
  state: GenerateSoundModalState,
  action: GenerateSoundModalAction
): GenerateSoundModalState {
  switch (action.type) {
    case 'SET_FORM':
      return { ...state, form: action.form };
    case 'SHOW_VALIDATION':
      return { ...state, showFormValidation: true };
    case 'GENERATE_START':
      return { ...state, step: 'generating', error: null };
    case 'GENERATE_SUCCESS':
      return { ...state, step: 'audition', result: action.result, error: null };
    case 'GENERATE_FAILURE':
      return { ...state, step: action.rollbackTo, error: action.error };
    case 'SAVE_START':
      return { ...state, step: 'saving', error: null };
    case 'SAVE_FAILURE':
      return { ...state, step: 'audition', error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}
