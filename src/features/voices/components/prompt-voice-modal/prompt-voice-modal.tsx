import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import {
  callGenerateFromPrompt,
  callSavePreview,
  type PreviewCandidate,
  type SavePreviewVoiceDTO,
} from '@/apis/voice-api';
import type { Voice, VoiceAge, VoiceGender, VoiceType } from '@/types/voice';
import { createLogger } from '@/utils/logger';
import { PromptVoiceForm } from './prompt-voice-form';
import { validatePromptVoiceForm } from './prompt-voice-form-validation';
import { PromptVoiceAudition } from './prompt-voice-audition';
import {
  DEFAULT_PROMPT_VOICE_FORM,
  type PromptVoiceFormState,
  type PromptVoiceModalStep,
} from './prompt-voice-modal-types';
import { mapVoiceErrorMessage } from './prompt-voice-error-mapping';

const log = createLogger('Voices', 'PromptVoiceModal');

const STALE_WARN_MS = 24 * 60 * 60 * 1000;

interface ModalError {
  code: string;
  message: string;
}

interface ModalState {
  step: PromptVoiceModalStep;
  form: PromptVoiceFormState;
  previews: PreviewCandidate[];
  previewText: string;
  selectedIndex: number | null;
  error: ModalError | null;
  generatedAt: number | null;
  showFormValidation: boolean;
}

type ModalAction =
  | { type: 'SET_FORM'; form: PromptVoiceFormState }
  | { type: 'SHOW_VALIDATION' }
  | { type: 'GENERATE_START' }
  | { type: 'GENERATE_SUCCESS'; previews: PreviewCandidate[]; previewText: string }
  | { type: 'GENERATE_FAILURE'; error: ModalError; rollbackTo: 'idle' | 'audition' }
  | { type: 'SELECT_PREVIEW'; index: number }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_FAILURE'; error: ModalError }
  | { type: 'CLEAR_ERROR' };

const initialState: ModalState = {
  step: 'idle',
  form: DEFAULT_PROMPT_VOICE_FORM,
  previews: [],
  previewText: '',
  selectedIndex: null,
  error: null,
  generatedAt: null,
  showFormValidation: false,
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'SET_FORM':
      return { ...state, form: action.form };
    case 'SHOW_VALIDATION':
      return { ...state, showFormValidation: true };
    case 'GENERATE_START':
      return { ...state, step: 'generating', error: null };
    case 'GENERATE_SUCCESS':
      return {
        ...state,
        step: 'audition',
        previews: action.previews,
        previewText: action.previewText,
        selectedIndex: null,
        generatedAt: Date.now(),
        error: null,
      };
    case 'GENERATE_FAILURE':
      return { ...state, step: action.rollbackTo, error: action.error };
    case 'SELECT_PREVIEW':
      return { ...state, selectedIndex: action.index };
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

// Convert BE DTO (camelCase per spec; snake-case fields handled defensively) → local Voice type.
function dtoToVoice(dto: SavePreviewVoiceDTO): Voice {
  // Defensive: BE may emit snake_case fields; fall back if camelCase missing.
  const anyDto = dto as unknown as Record<string, unknown>;
  const elevenId =
    (dto.elevenId as string | undefined) ??
    (typeof anyDto.eleven_id === 'string' ? (anyDto.eleven_id as string) : null);
  const previewAudioUrl =
    (dto.previewAudioUrl as string | undefined) ??
    (typeof anyDto.preview_audio_url === 'string'
      ? (anyDto.preview_audio_url as string)
      : '') ??
    '';
  const sampleAudioUrl =
    (dto.sampleAudioUrl as string | null | undefined) ??
    (typeof anyDto.sample_audio_url === 'string'
      ? (anyDto.sample_audio_url as string)
      : null);
  const createdAt =
    (dto.createdAt as string | undefined) ??
    (typeof anyDto.created_at === 'string' ? (anyDto.created_at as string) : undefined) ??
    new Date().toISOString();

  return {
    id: dto.id,
    name: dto.name,
    gender: dto.gender as VoiceGender,
    age: dto.age as VoiceAge,
    language: dto.language,
    accent: dto.accent,
    description: dto.description ?? null,
    model: dto.model ?? null,
    elevenId: elevenId ?? null,
    tags: dto.tags ?? null,
    type: (dto.type ?? 0) as VoiceType,
    previewAudioUrl: previewAudioUrl || null,
    sampleAudioUrl: sampleAudioUrl ?? null,
    loudness: dto.loudness ?? null,
    guidance: dto.guidance ?? null,
    createdAt,
  };
}

export interface PromptVoiceModalProps {
  onClose: () => void;
  onSaved: (voice: Voice) => void;
}

export function PromptVoiceModal({ onClose, onSaved }: PromptVoiceModalProps) {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  const isWorking = state.step === 'generating' || state.step === 'saving';
  const hasPreviews = state.previews.length > 0;
  const isFormValid = validatePromptVoiceForm(state.form).isValid;

  const [isStale, setIsStale] = useState(false);
  useEffect(() => {
    if (state.generatedAt === null) return;
    const id = window.setTimeout(() => setIsStale(true), STALE_WARN_MS);
    return () => window.clearTimeout(id);
  }, [state.generatedAt]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.generatedAt === null) return;
    const el = bodyRef.current;
    if (!el) return;
    // Wait one frame so newly rendered audition cards are laid out before scrolling.
    const raf = window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [state.generatedAt]);

  const handleGenerate = useCallback(async () => {
    const validation = validatePromptVoiceForm(state.form);
    if (!validation.isValid) {
      log.warn('handleGenerate', 'invalid form', { fields: Object.keys(validation.errors) });
      dispatch({ type: 'SHOW_VALIDATION' });
      return;
    }

    const forceVariation = state.previews.length > 0;
    const rollbackTo: 'idle' | 'audition' = forceVariation ? 'audition' : 'idle';

    log.info('handleGenerate', 'start', {
      forceVariation,
      language: state.form.language,
      gender: state.form.gender,
      age: state.form.age,
    });
    dispatch({ type: 'GENERATE_START' });

    const seed = forceVariation ? Date.now() & 0x7fffffff : undefined;

    const result = await callGenerateFromPrompt({
      description: state.form.description.trim(),
      gender: state.form.gender,
      age: state.form.age,
      language: state.form.language,
      accent: state.form.accent,
      loudness: state.form.loudness,
      guidance: state.form.guidance,
      seed,
    });

    if (result.success) {
      log.info('handleGenerate', 'success', { previewCount: result.data.previews.length });
      dispatch({
        type: 'GENERATE_SUCCESS',
        previews: result.data.previews,
        previewText: result.data.previewText,
      });
      return;
    }

    log.error('handleGenerate', 'failure', {
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      rollbackTo,
    });
    dispatch({
      type: 'GENERATE_FAILURE',
      error: {
        code: result.errorCode,
        message: mapVoiceErrorMessage(result.errorCode, result.error),
      },
      rollbackTo,
    });
  }, [state.form, state.previews.length]);

  const handleSave = useCallback(async () => {
    if (state.selectedIndex === null) {
      log.warn('handleSave', 'no preview selected');
      return;
    }
    const selected = state.previews[state.selectedIndex];
    if (!selected) return;

    const rejectedIds = state.previews
      .filter((_, i) => i !== state.selectedIndex)
      .map((p) => p.generatedVoiceId);

    log.info('handleSave', 'start', {
      selectedIndex: state.selectedIndex,
      rejectedCount: rejectedIds.length,
    });
    dispatch({ type: 'SAVE_START' });

    const result = await callSavePreview({
      generatedVoiceId: selected.generatedVoiceId,
      audioBase64: selected.audioBase64,
      rejectedGeneratedVoiceIds: rejectedIds,
      name: state.form.name.trim(),
      description: state.form.description.trim(),
      gender: state.form.gender,
      age: state.form.age,
      language: state.form.language,
      accent: state.form.accent,
      tags: state.form.tags.trim() || undefined,
      loudness: state.form.loudness,
      guidance: state.form.guidance,
    });

    if (result.success) {
      log.info('handleSave', 'success', { voiceId: result.data.voice.id });
      onSaved(dtoToVoice(result.data.voice));
      onClose();
      return;
    }

    log.error('handleSave', 'failure', {
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
    });
    dispatch({
      type: 'SAVE_FAILURE',
      error: {
        code: result.errorCode,
        message: mapVoiceErrorMessage(result.errorCode, result.error),
      },
    });
  }, [state.form, state.previews, state.selectedIndex, onSaved, onClose]);

  const handleDismiss = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      if (isWorking) {
        log.warn('handleDismiss', 'blocked', { step: state.step });
        return;
      }
      onClose();
    },
    [isWorking, state.step, onClose]
  );

  const generateLabel =
    state.step === 'generating' ? 'Generating...' : hasPreviews ? 'Regenerate' : 'Generate';
  const saveLabel = state.step === 'saving' ? 'Saving...' : 'Save';

  return (
    <Dialog open onOpenChange={handleDismiss}>
      <DialogContent
        className={cn(
          'sm:max-w-[560px] max-h-[85vh] flex flex-col p-0 gap-0',
          isWorking && '[&>button[aria-label=Close]]:hidden'
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Prompt Voice
          </DialogTitle>
        </DialogHeader>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          <PromptVoiceForm
            value={state.form}
            onChange={(f) => dispatch({ type: 'SET_FORM', form: f })}
            disabled={isWorking}
            showValidation={state.showFormValidation}
          />

          <div className="flex justify-center py-2">
            <Button
              type="button"
              variant="default"
              onClick={handleGenerate}
              disabled={!isFormValid || isWorking}
              className="gap-2 min-w-[160px]"
            >
              {state.step === 'generating' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generateLabel}
            </Button>
          </div>

          {hasPreviews ? (
            <PromptVoiceAudition
              previewText={state.previewText}
              previews={state.previews}
              selectedIndex={state.selectedIndex}
              onSelect={(i) => dispatch({ type: 'SELECT_PREVIEW', index: i })}
              disabled={isWorking}
            />
          ) : null}

          {isStale ? (
            <div
              role="alert"
              className="rounded-md border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-2 text-xs text-yellow-800 dark:text-yellow-300"
            >
              Previews đã tạo quá 24 giờ trước và có thể hết hạn. Vui lòng Regenerate.
            </div>
          ) : null}

          {state.error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              {state.error.message}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isWorking}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleSave}
            disabled={state.selectedIndex === null || isWorking}
            className="gap-2"
          >
            {state.step === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
