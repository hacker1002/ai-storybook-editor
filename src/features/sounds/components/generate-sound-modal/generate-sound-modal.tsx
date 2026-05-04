import { useCallback, useReducer } from 'react';
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
import { supabase } from '@/apis/supabase';
import { callGenerateSoundEffect } from '@/apis/sound-api';
import { mapSoundRow } from '@/features/sounds/utils/sound-mapper';
import { normalizeTags } from '@/features/sounds/utils/sound-filters';
import type { Sound, SoundRow } from '@/types/sound';
import { createLogger } from '@/utils/logger';
import { GenerateSoundForm } from './generate-sound-form';
import { GenerateSoundAudition } from './generate-sound-audition';
import { validateGenerateSoundForm } from './generate-sound-form-validation';
import { mapGenerateSoundErrorMessage } from './generate-sound-error-mapping';
import {
  INITIAL_GENERATE_SOUND_STATE,
  generateSoundModalReducer,
} from './generate-sound-modal-types';

const log = createLogger('Sounds', 'GenerateSoundModal');

export interface GenerateSoundModalProps {
  onClose: () => void;
  onSaved: (sound: Sound) => void;
}

export function GenerateSoundModal({ onClose, onSaved }: GenerateSoundModalProps) {
  const [state, dispatch] = useReducer(
    generateSoundModalReducer,
    INITIAL_GENERATE_SOUND_STATE
  );

  const isWorking = state.step === 'generating' || state.step === 'saving';
  const hasResult = state.result !== null;
  const isFormValid = validateGenerateSoundForm(state.form).isValid;

  const handleGenerate = useCallback(async () => {
    const validation = validateGenerateSoundForm(state.form);
    if (!validation.isValid) {
      log.warn('handleGenerate', 'invalid form', {
        fields: Object.keys(validation.errors),
      });
      dispatch({ type: 'SHOW_VALIDATION' });
      return;
    }

    const forceVariation = state.result !== null;
    const rollbackTo: 'idle' | 'audition' = forceVariation ? 'audition' : 'idle';
    const seed = forceVariation ? Date.now() >>> 0 : undefined;

    log.info('handleGenerate', 'start', {
      forceVariation,
      loop: state.form.loop,
      durationAuto: state.form.durationAuto,
      descLen: state.form.description.trim().length,
    });

    dispatch({ type: 'GENERATE_START' });

    const result = await callGenerateSoundEffect({
      description: state.form.description.trim(),
      loop: state.form.loop,
      durationSecs: state.form.durationAuto ? null : state.form.durationSecs,
      promptInfluence: state.form.promptInfluence,
      seed,
    });

    if (result.success) {
      log.info('handleGenerate', 'success', {
        durationSecs: result.data.durationSecs,
        mediaType: result.data.mediaType,
      });
      dispatch({
        type: 'GENERATE_SUCCESS',
        result: {
          soundUrl: result.data.soundUrl,
          durationSecs: result.data.durationSecs,
          mediaType: result.data.mediaType,
        },
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
        message: mapGenerateSoundErrorMessage(result.errorCode, result.error),
      },
      rollbackTo,
    });
  }, [state.form, state.result]);

  const handleSave = useCallback(async () => {
    if (!state.result) {
      log.warn('handleSave', 'no result', {});
      return;
    }
    const trimmedName = state.form.name.trim();
    if (!trimmedName) {
      log.warn('handleSave', 'empty name', {});
      dispatch({
        type: 'SAVE_FAILURE',
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
      });
      return;
    }

    log.info('handleSave', 'start', {
      durationMs: Math.round(state.result.durationSecs * 1000),
      influence: state.form.promptInfluence,
    });

    dispatch({ type: 'SAVE_START' });

    const trimmedDesc = state.form.description.trim();
    const tagsNormalized = normalizeTags(state.form.tags);

    const insertPayload = {
      name: trimmedName,
      description: trimmedDesc.length > 0 ? trimmedDesc : null,
      tags: tagsNormalized.length > 0 ? tagsNormalized : null,
      loop: state.form.loop,
      media_url: state.result.soundUrl,
      duration: Math.round(state.result.durationSecs * 1000),
      influence: state.form.promptInfluence,
      source: 1,
    };

    const { data, error } = await supabase
      .from('sounds')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      log.error('handleSave', 'insert failed', {
        code: error?.code,
        message: error?.message,
      });
      dispatch({
        type: 'SAVE_FAILURE',
        error: {
          code: 'INSERT_FAILED',
          message: 'Failed to save sound. Please try again.',
        },
      });
      return;
    }

    const sound = mapSoundRow(data as SoundRow);
    log.info('handleSave', 'success', { id: sound.id });
    onSaved(sound);
    onClose();
  }, [state.form, state.result, onClose, onSaved]);

  const handleDismiss = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      if (state.step === 'generating') {
        log.warn('handleDismiss', 'blocked GENERATING', {});
        return;
      }
      if (state.step === 'saving') {
        log.warn('handleDismiss', 'blocked SAVING', {});
        return;
      }
      onClose();
    },
    [state.step, onClose]
  );

  const generateLabel = state.step === 'generating' ? 'Generating...' : 'Generate';
  const saveLabel = state.step === 'saving' ? 'Saving...' : 'Save';
  const canSave = hasResult && state.form.name.trim().length > 0 && !isWorking;

  return (
    <Dialog open onOpenChange={handleDismiss}>
      <DialogContent
        className={cn(
          'sm:max-w-[480px] max-h-[85vh] flex flex-col p-0 gap-0',
          isWorking && '[&>button[aria-label=Close]]:hidden'
        )}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          <GenerateSoundForm
            value={state.form}
            onChange={(f) => dispatch({ type: 'SET_FORM', form: f })}
            disabled={isWorking}
            showValidation={state.showFormValidation}
          />

          {state.result ? (
            <GenerateSoundAudition result={state.result} disabled={isWorking} />
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
          <Button
            type="button"
            variant="default"
            onClick={handleGenerate}
            disabled={!isFormValid || isWorking}
            className="gap-2"
          >
            {state.step === 'generating' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generateLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={!canSave}
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
