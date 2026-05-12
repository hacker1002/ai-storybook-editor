import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Loader2 } from 'lucide-react';
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
  callCloneFromHuman,
  type CloneFromHumanVoiceDTO,
} from '@/apis/voice-api';
import { useHumans, useHumansActions, useHumansLoading } from '@/stores/humans-store';
import type { Voice, VoiceAge, VoiceGender, VoiceType } from '@/types/voice';
import { createLogger } from '@/utils/logger';
import { CloneVoiceForm } from './clone-voice-form';
import { HumanProfilePicker } from './human-profile-picker';
import {
  DEFAULT_CLONE_VOICE_FORM,
  type CloneVoiceFormState,
  type CloneVoiceModalStep,
} from './clone-voice-modal-types';
import {
  deriveAgeEnumFromVoiceProfile,
  validateCloneVoiceForm,
} from './clone-voice-form-validation';
import {
  mapCloneVoiceError,
  type CloneVoiceErrorPresentation,
} from './clone-voice-error-mapping';

const log = createLogger('Voices', 'CloneVoiceModal');

// Defensive snake_case fallback mirrors prompt-voice-modal.dtoToVoice — BE spec is camelCase
// but historical fixtures emit both shapes.
function dtoToVoice(dto: CloneFromHumanVoiceDTO): Voice {
  const anyDto = dto as unknown as Record<string, unknown>;
  const elevenId =
    (dto.elevenId as string | undefined) ??
    (typeof anyDto.eleven_id === 'string' ? (anyDto.eleven_id as string) : null);
  const previewAudioUrl =
    (dto.previewAudioUrl as string | undefined) ??
    (typeof anyDto.preview_audio_url === 'string'
      ? (anyDto.preview_audio_url as string)
      : '');
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
    gender: dto.gender as NonNullable<VoiceGender>,
    age: dto.age as NonNullable<VoiceAge>,
    language: dto.language,
    accent: dto.accent,
    description: dto.description ?? null,
    model: dto.model ?? null,
    elevenId: elevenId ?? null,
    tags: dto.tags ?? null,
    type: (dto.type ?? 1) as VoiceType,
    previewAudioUrl: previewAudioUrl || null,
    sampleAudioUrl: sampleAudioUrl ?? null,
    loudness: dto.loudness ?? null,
    guidance: dto.guidance ?? null,
    createdAt,
  };
}

export interface CloneVoiceModalProps {
  onClose: () => void;
  onCloned: (voice: Voice) => void;
}

export function CloneVoiceModal({ onClose, onCloned }: CloneVoiceModalProps) {
  const humans = useHumans();
  const isLoadingHumans = useHumansLoading();
  const { fetchHumans } = useHumansActions();

  const [form, setForm] = useState<CloneVoiceFormState>(DEFAULT_CLONE_VOICE_FORM);
  const [step, setStep] = useState<CloneVoiceModalStep>('idle');
  const [error, setError] = useState<CloneVoiceErrorPresentation | null>(null);
  const [showFormValidation, setShowFormValidation] = useState(false);

  // Always refetch on mount (Validation Session 1 Q1) — fresh voice_profiles, no cache guard.
  useEffect(() => {
    log.info('mount', 'opened');
    fetchHumans();
    return () => {
      log.info('unmount', 'closed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedHuman = useMemo(
    () => humans.find((h) => h.id === form.humanId) ?? null,
    [humans, form.humanId]
  );

  const selectedVoiceProfile = useMemo(() => {
    if (!selectedHuman || form.voiceProfileIndex === null) return null;
    return selectedHuman.voiceProfiles[form.voiceProfileIndex] ?? null;
  }, [selectedHuman, form.voiceProfileIndex]);

  const validation = validateCloneVoiceForm(form, Boolean(selectedVoiceProfile?.recordUrl));
  const isFormValid = validation.isValid;
  const isCloning = step === 'cloning';

  const handleHumanSelect = useCallback(
    (humanId: string) => {
      const human = humans.find((h) => h.id === humanId);
      // Auto-suggest gender from human.gender when known; keep current form.gender when null.
      const suggestedGender =
        human && human.gender !== null ? (human.gender as NonNullable<VoiceGender>) : null;
      log.debug('handleHumanSelect', 'changed', {
        humanId,
        humanGender: human?.gender ?? null,
        suggestedGender,
      });
      setForm((prev) => ({
        ...prev,
        humanId,
        voiceProfileIndex: null,
        gender: suggestedGender ?? prev.gender,
      }));
    },
    [humans]
  );

  const handleVoiceProfileSelect = useCallback(
    (idx: number) => {
      const human = humans.find((h) => h.id === form.humanId);
      const vp = human?.voiceProfiles[idx];
      if (!human || !vp) {
        log.warn('handleVoiceProfileSelect', 'profile not found', { idx });
        return;
      }
      const suggestedAge = deriveAgeEnumFromVoiceProfile(vp.age);
      log.info('handleVoiceProfileSelect', 'voice_profile_selected', {
        humanId: form.humanId,
        voiceProfileName: vp.name,
        rawAge: vp.age,
        suggestedAge,
      });
      setForm((prev) => ({ ...prev, voiceProfileIndex: idx, age: suggestedAge }));
    },
    [humans, form.humanId]
  );

  const handleClone = useCallback(async () => {
    if (!isFormValid) {
      log.warn('handleClone', 'invalid form', { fields: Object.keys(validation.errors) });
      setShowFormValidation(true);
      return;
    }
    if (!selectedVoiceProfile || !selectedHuman) {
      log.warn('handleClone', 'missing selection');
      return;
    }

    const startedAt = Date.now();
    setStep('cloning');
    setError(null);
    log.info('handleClone', 'clone_submitted', {
      humanId: form.humanId,
      voiceProfileName: selectedVoiceProfile.name,
      language: form.language,
      gender: form.gender,
      age: form.age,
    });

    const result = await callCloneFromHuman({
      recordUrl: selectedVoiceProfile.recordUrl,
      name: form.name.trim(),
      gender: form.gender,
      age: form.age,
      language: form.language,
      accent: form.accent,
      description: form.description.trim() || undefined,
      tags: form.tags.trim() || undefined,
      source: {
        humanId: form.humanId ?? undefined,
        voiceProfileName: selectedVoiceProfile.name,
      },
    });

    const durationMs = Date.now() - startedAt;

    if (result.success) {
      log.info('handleClone', 'clone_succeeded', {
        voiceId: result.data.voice.id,
        elevenId: result.data.voice.elevenId,
        durationMs,
      });
      onCloned(dtoToVoice(result.data.voice));
      onClose();
      return;
    }

    const presentation = mapCloneVoiceError(result.errorCode, result.error, {
      humanId: form.humanId,
      serverMessage: result.error,
    });
    log.error('handleClone', 'clone_failed', {
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      durationMs,
      humanId: form.humanId,
      voiceProfileName: selectedVoiceProfile.name,
    });
    setError(presentation);
    setStep('clone_err');
  }, [
    isFormValid,
    validation.errors,
    selectedHuman,
    selectedVoiceProfile,
    form,
    onCloned,
    onClose,
  ]);

  const handleDismiss = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      if (isCloning) {
        log.warn('handleDismiss', 'blocked', { step });
        return;
      }
      onClose();
    },
    [isCloning, step, onClose]
  );

  return (
    <Dialog open onOpenChange={handleDismiss}>
      <DialogContent
        className={cn(
          'sm:max-w-[560px] max-h-[85vh] flex flex-col p-0 gap-0',
          isCloning && '[&>button[aria-label=Close]]:hidden'
        )}
        onEscapeKeyDown={(e) => {
          if (isCloning) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isCloning) e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            Clone Voice
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          <HumanProfilePicker
            humans={humans}
            isLoading={isLoadingHumans}
            humanId={form.humanId}
            voiceProfileIndex={form.voiceProfileIndex}
            onHumanSelect={handleHumanSelect}
            onVoiceProfileSelect={handleVoiceProfileSelect}
            disabled={isCloning}
          />

          <CloneVoiceForm
            value={form}
            onChange={setForm}
            disabled={isCloning}
            showValidation={showFormValidation}
          />

          {isCloning ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md border bg-muted/50 p-4 text-sm flex items-center gap-3"
            >
              <Loader2 className="animate-spin h-4 w-4 flex-shrink-0" />
              <div>
                <div className="font-medium">Training voice... (~30s)</div>
                <div className="text-muted-foreground text-xs">
                  Cloning typically takes 15–45 seconds. Please don't close this window.
                </div>
              </div>
            </div>
          ) : null}

          {error && !isCloning ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive space-y-1"
            >
              <div>{error.message}</div>
              {error.linkTo ? (
                <Link
                  to={error.linkTo}
                  onClick={onClose}
                  className="underline inline-block"
                >
                  {error.linkLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4 flex-row justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isCloning}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleClone}
            disabled={!isFormValid || isCloning}
            className="gap-2"
          >
            {isCloning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {isCloning ? 'Cloning...' : 'Clone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
