// Generic state machine hook for generate modals (sound, music, ...).
// State diagram:
//   idle ──▶ generating ──┬─▶ audition ──▶ saving ──▶ (close on success)
//                         │                  │
//                         └─▶ error           └─▶ audition (error)
//
// Reducer is local and pure; side effects (`generate`, `save`) are injected
// via options so this hook stays domain-agnostic.

import { useCallback, useReducer } from 'react';
import { createLogger } from '@/utils/logger';
import type { AudioResource } from '../types';

const log = createLogger('AudioLibrary', 'useGenerateModalFlow');

export type GenerateModalStep = 'idle' | 'generating' | 'audition' | 'saving';

export interface ModalError {
  code: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export type GenerateOutcome<TResult> =
  | { success: true; data: TResult }
  | { success: false; error: ModalError };

export interface GenerateModalFlowOptions<TForm, TResult> {
  initialForm: TForm;
  validate: (form: TForm) => ValidationResult;
  generate: (form: TForm, opts: { seed?: number }) => Promise<GenerateOutcome<TResult>>;
  save: (form: TForm, result: TResult) => Promise<AudioResource>;
  onSaved?: (saved: AudioResource) => void;
}

export interface GenerateModalFlowReturn<TForm, TResult> {
  step: GenerateModalStep;
  form: TForm;
  setForm: (next: TForm) => void;
  patchForm: (patch: Partial<TForm>) => void;
  result: TResult | null;
  error: ModalError | null;
  showValidation: boolean;
  isWorking: boolean;
  hasResult: boolean;
  handleGenerate: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleDismiss: (open: boolean, onClose: () => void) => void;
  reset: () => void;
}

interface State<TForm, TResult> {
  step: GenerateModalStep;
  form: TForm;
  result: TResult | null;
  error: ModalError | null;
  showValidation: boolean;
}

type Action<TForm, TResult> =
  | { type: 'SET_FORM'; form: TForm }
  | { type: 'PATCH_FORM'; patch: Partial<TForm> }
  | { type: 'SHOW_VALIDATION' }
  | { type: 'GENERATE_START' }
  | { type: 'GENERATE_SUCCESS'; result: TResult }
  | { type: 'GENERATE_FAILURE'; error: ModalError; rollbackTo: 'idle' | 'audition' }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_FAILURE'; error: ModalError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET'; initialForm: TForm };

function reducer<TForm, TResult>(
  state: State<TForm, TResult>,
  action: Action<TForm, TResult>,
): State<TForm, TResult> {
  switch (action.type) {
    case 'SET_FORM':
      return { ...state, form: action.form };
    case 'PATCH_FORM':
      return { ...state, form: { ...state.form, ...action.patch } };
    case 'SHOW_VALIDATION':
      return { ...state, showValidation: true };
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
    case 'RESET':
      return {
        step: 'idle',
        form: action.initialForm,
        result: null,
        error: null,
        showValidation: false,
      };
    default:
      return state;
  }
}

export function useGenerateModalFlow<TForm, TResult>(
  options: GenerateModalFlowOptions<TForm, TResult>,
): GenerateModalFlowReturn<TForm, TResult> {
  const { initialForm, validate, generate, save, onSaved } = options;

  const [state, dispatch] = useReducer(
    reducer as (s: State<TForm, TResult>, a: Action<TForm, TResult>) => State<TForm, TResult>,
    {
      step: 'idle',
      form: initialForm,
      result: null,
      error: null,
      showValidation: false,
    },
  );

  const isWorking = state.step === 'generating' || state.step === 'saving';
  const hasResult = state.result !== null;

  const setForm = useCallback((next: TForm) => {
    dispatch({ type: 'SET_FORM', form: next });
  }, []);

  const patchForm = useCallback((patch: Partial<TForm>) => {
    dispatch({ type: 'PATCH_FORM', patch });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET', initialForm });
  }, [initialForm]);

  const handleGenerate = useCallback(async () => {
    const v = validate(state.form);
    if (!v.isValid) {
      log.warn('handleGenerate', 'invalid form', { fields: Object.keys(v.errors) });
      dispatch({ type: 'SHOW_VALIDATION' });
      return;
    }

    const forceVariation = state.result !== null;
    const rollbackTo: 'idle' | 'audition' = forceVariation ? 'audition' : 'idle';
    const seed = forceVariation ? Date.now() >>> 0 : undefined;

    log.info('handleGenerate', 'start', { forceVariation });
    dispatch({ type: 'GENERATE_START' });

    const outcome = await generate(state.form, { seed });
    if (outcome.success) {
      log.info('handleGenerate', 'success', {});
      dispatch({ type: 'GENERATE_SUCCESS', result: outcome.data });
      return;
    }
    log.error('handleGenerate', 'failure', {
      errorCode: outcome.error.code,
      rollbackTo,
    });
    dispatch({ type: 'GENERATE_FAILURE', error: outcome.error, rollbackTo });
  }, [state.form, state.result, validate, generate]);

  const handleSave = useCallback(async () => {
    if (state.result === null) {
      log.warn('handleSave', 'no result', {});
      return;
    }
    log.info('handleSave', 'start', {});
    dispatch({ type: 'SAVE_START' });
    try {
      const saved = await save(state.form, state.result);
      log.info('handleSave', 'success', { id: saved.id });
      onSaved?.(saved);
    } catch (err) {
      log.error('handleSave', 'failed', {
        msg: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
      dispatch({
        type: 'SAVE_FAILURE',
        error: {
          code: 'SAVE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to save. Please try again.',
        },
      });
    }
  }, [state.form, state.result, save, onSaved]);

  const handleDismiss = useCallback(
    (open: boolean, onClose: () => void) => {
      if (open) return;
      if (state.step === 'generating' || state.step === 'saving') {
        log.warn('handleDismiss', 'blocked', { step: state.step });
        return;
      }
      onClose();
    },
    [state.step],
  );

  return {
    step: state.step,
    form: state.form,
    setForm,
    patchForm,
    result: state.result,
    error: state.error,
    showValidation: state.showValidation,
    isWorking,
    hasResult,
    handleGenerate,
    handleSave,
    handleDismiss,
    reset,
  };
}
