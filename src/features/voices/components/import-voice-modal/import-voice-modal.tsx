import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { supabase } from '@/apis/supabase';
import {
  callGetFromElevenId,
  type GetFromElevenIdData,
} from '@/apis/voice-api';
import type { Voice, VoiceRow } from '@/types/voice';
import { mapVoiceRow } from '@/features/voices/utils/voice-mapper';
import { createLogger } from '@/utils/logger';
import {
  DEFAULT_IMPORT_FORM,
  type ImportVoiceFormState,
  type ImportVoiceStep,
} from './import-voice-modal-types';
import {
  IMPORT_INSERT_ERROR_MESSAGES,
  mapGetFromElevenIdMessage,
} from './import-voice-error-mapping';
import { ImportVoiceForm } from './import-voice-form';
import { isSupportedLanguage, validateImportForm } from './import-voice-form-validation';
import { AudioPreview } from './audio-preview';

const log = createLogger('Voices', 'ImportVoiceModal');

const ELEVEN_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;
const FETCH_DEBOUNCE_MS = 500;

interface ModalError {
  code: string;
  message: string;
}

interface ImportModalState {
  step: ImportVoiceStep;
  elevenId: string;
  form: ImportVoiceFormState;
  fetchError: ModalError | null;
  insertError: ModalError | null;
}

type ImportModalAction =
  | { type: 'SET_ELEVEN_ID'; elevenId: string }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; form: ImportVoiceFormState }
  | { type: 'FETCH_FAILURE'; error: ModalError }
  | { type: 'SET_FORM'; form: ImportVoiceFormState }
  | { type: 'INSERT_START' }
  | { type: 'INSERT_FAILURE'; error: ModalError }
  | { type: 'CLEAR_FETCH_ERROR' }
  | { type: 'CLEAR_INSERT_ERROR' };

const initialState: ImportModalState = {
  step: 'idle',
  elevenId: '',
  form: DEFAULT_IMPORT_FORM,
  fetchError: null,
  insertError: null,
};

function importReducer(state: ImportModalState, action: ImportModalAction): ImportModalState {
  switch (action.type) {
    case 'SET_ELEVEN_ID': {
      const trimmed = action.elevenId.trim();
      return {
        ...state,
        elevenId: action.elevenId,
        // Reset to idle when input cleared so form stays empty.
        step: trimmed === '' ? 'idle' : state.step,
        fetchError: null,
      };
    }
    case 'FETCH_START':
      return { ...state, step: 'fetching', fetchError: null };
    case 'FETCH_SUCCESS':
      return { ...state, step: 'ready', form: action.form, fetchError: null };
    case 'FETCH_FAILURE':
      return { ...state, step: 'fetch_err', fetchError: action.error };
    case 'SET_FORM':
      return { ...state, form: action.form };
    case 'INSERT_START':
      return { ...state, step: 'inserting', insertError: null };
    case 'INSERT_FAILURE':
      return { ...state, step: 'ready', insertError: action.error };
    case 'CLEAR_FETCH_ERROR':
      return { ...state, fetchError: null };
    case 'CLEAR_INSERT_ERROR':
      return { ...state, insertError: null };
    default:
      return state;
  }
}

function mapApiToFormState(data: GetFromElevenIdData): ImportVoiceFormState {
  // Drop unsupported language codes (e.g. ElevenLabs returns "en_CA" but app only
  // supports 5 locales) — force user to pick from supported list.
  const language = isSupportedLanguage(data.language) ? data.language : null;
  return {
    name: data.name,
    gender: data.gender,
    age: data.age,
    language,
    accent: data.accent,
    description: data.description ?? '',
    tags: data.tags ?? '',
    previewAudioUrl: data.previewAudioUrl,
  };
}

export interface ImportVoiceModalProps {
  onClose: () => void;
  onImported: (voice: Voice) => void;
}

export function ImportVoiceModal({ onClose, onImported }: ImportVoiceModalProps) {
  const [state, dispatch] = useReducer(importReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showFormValidation, setShowFormValidation] = useState(false);

  const isWorking = state.step === 'fetching' || state.step === 'inserting';
  const trimmedId = state.elevenId.trim();
  const clientInvalid = trimmedId.length > 0 && !ELEVEN_ID_PATTERN.test(trimmedId);

  // Debounced fetch effect — fires 500ms after elevenId changes, cancels prior in-flight.
  useEffect(() => {
    if (trimmedId === '') return;
    if (!ELEVEN_ID_PATTERN.test(trimmedId)) {
      log.debug('fetchEffect', 'debounce-skip', { reason: 'invalid-format' });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = window.setTimeout(async () => {
      log.info('fetchEffect', 'start', { elevenIdLength: trimmedId.length });
      dispatch({ type: 'FETCH_START' });

      const result = await callGetFromElevenId(trimmedId, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (result.success) {
        const nextForm = mapApiToFormState(result.data);
        log.info('fetchEffect', 'success', {
          hasLanguage: nextForm.language !== null,
          hasPreview: nextForm.previewAudioUrl !== null,
        });
        dispatch({ type: 'FETCH_SUCCESS', form: nextForm });
        return;
      }

      if (result.errorCode === 'ABORT') return;

      log.error('fetchEffect', 'failure', {
        errorCode: result.errorCode,
        httpStatus: result.httpStatus,
      });
      dispatch({
        type: 'FETCH_FAILURE',
        error: {
          code: result.errorCode,
          message: mapGetFromElevenIdMessage(result.errorCode, result.error),
        },
      });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmedId]);

  const handleElevenIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    log.debug('handleElevenIdChange', 'change', { length: e.target.value.length });
    dispatch({ type: 'SET_ELEVEN_ID', elevenId: e.target.value });
  }, []);

  const handleDismiss = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      if (state.step === 'inserting') {
        log.warn('handleDismiss', 'blocked', { step: state.step });
        return;
      }
      onClose();
    },
    [state.step, onClose]
  );

  const handleImport = useCallback(async () => {
    const validation = validateImportForm(state.form);
    if (!validation.isValid) {
      log.warn('handleImport', 'invalid form', {
        fields: Object.keys(validation.errors),
      });
      setShowFormValidation(true);
      return;
    }

    const elevenId = state.elevenId.trim();
    log.info('handleImport', 'start', {
      elevenIdLength: elevenId.length,
      language: state.form.language,
      gender: state.form.gender,
      age: state.form.age,
    });
    dispatch({ type: 'INSERT_START' });

    const payload = {
      name: state.form.name.trim(),
      gender: state.form.gender,
      age: state.form.age,
      language: state.form.language,
      accent: state.form.accent,
      description: state.form.description.trim() || null,
      model: null,
      eleven_id: elevenId,
      tags: state.form.tags.trim() || null,
      type: 3,
      preview_audio_url: state.form.previewAudioUrl,
      sample_audio_url: null,
      loudness: null,
      guidance: null,
    };

    try {
      const { data: row, error } = await supabase
        .from('voices')
        .insert(payload)
        .select()
        .single();

      if (error) {
        log.error('handleImport', 'pg error', {
          pgCode: error.code,
          pgMessage: error.message?.slice(0, 120),
        });
        dispatch({
          type: 'INSERT_FAILURE',
          error: {
            code: error.code ?? 'DB_ERROR',
            message: IMPORT_INSERT_ERROR_MESSAGES.GENERIC_FAILURE,
          },
        });
        return;
      }

      if (!row) {
        log.error('handleImport', 'no row returned');
        dispatch({
          type: 'INSERT_FAILURE',
          error: {
            code: 'NO_ROW',
            message: IMPORT_INSERT_ERROR_MESSAGES.GENERIC_FAILURE,
          },
        });
        return;
      }

      const voice = mapVoiceRow(row as VoiceRow);
      log.info('handleImport', 'success', { voiceId: voice.id });
      onImported(voice);
      onClose();
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      log.error('handleImport', 'unexpected error', {
        name,
        msg: String(err).slice(0, 120),
      });
      dispatch({
        type: 'INSERT_FAILURE',
        error: {
          code: 'UNKNOWN',
          message: IMPORT_INSERT_ERROR_MESSAGES.GENERIC_FAILURE,
        },
      });
    }
  }, [state.form, state.elevenId, onImported, onClose]);

  const showHelp = state.step === 'idle' && trimmedId === '';
  const showFetchErr =
    state.step === 'fetch_err' &&
    state.fetchError !== null &&
    state.fetchError.message !== '';

  const canSubmit =
    state.step === 'ready' && !isWorking && validateImportForm(state.form).isValid;

  return (
    <Dialog open onOpenChange={handleDismiss}>
      <DialogContent
        className={cn(
          'sm:max-w-[520px] max-h-[85vh] flex flex-col p-0 gap-0',
          isWorking && '[&>button[aria-label=Close]]:hidden'
        )}
        onEscapeKeyDown={(e) => {
          if (state.step === 'inserting') e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (state.step === 'inserting') e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Import Voice
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="import-eleven-id"
              className="text-xs font-medium uppercase tracking-wide"
            >
              ElevenLabs Voice ID
            </Label>
            <div className="relative">
              <Input
                id="import-eleven-id"
                value={state.elevenId}
                onChange={handleElevenIdChange}
                disabled={state.step === 'inserting'}
                placeholder="e.g. JBFqnCBsd6RMkjVDRZzb"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={clientInvalid || showFetchErr}
              />
              {state.step === 'fetching' ? (
                <Loader2
                  className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-label="Looking up voice..."
                />
              ) : null}
            </div>
            {showHelp ? (
              <p className="text-xs text-muted-foreground">
                Paste the voice ID from your ElevenLabs voice library.
              </p>
            ) : clientInvalid ? (
              <p className="text-xs text-destructive" role="alert">
                Invalid ID format.
              </p>
            ) : showFetchErr ? (
              <p className="text-xs text-destructive" role="alert">
                ⚠ {state.fetchError?.message}
              </p>
            ) : null}
          </div>

          <ImportVoiceForm
            value={state.form}
            onChange={(f) => dispatch({ type: 'SET_FORM', form: f })}
            disabled={state.step === 'inserting'}
            showValidation={showFormValidation}
          />

          {state.form.previewAudioUrl ? (
            <AudioPreview url={state.form.previewAudioUrl} />
          ) : null}

          {state.insertError ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              {state.insertError.message}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isWorking}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleImport}
            disabled={!canSubmit}
            className="gap-2"
          >
            {state.step === 'inserting' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {state.step === 'inserting' ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
