// voice-setting-tab-panel.tsx
// Character voice setting panel — replaces VoicesTabPanelMock.
// Structure: VoiceSelector (groupByLanguage) + VoiceInferenceParams + 5 preview sections.

import * as React from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { VOICE_LANGUAGES } from '@/constants/config-constants';
import { VoiceInferenceParams } from '@/features/voices/components/voice-inference-params';
import type { VoiceInferenceParamsValue } from '@/features/voices/components/voice-inference-params';
import {
  VoicePreviewCard,
  VoiceSelector,
} from '@/features/voices/components/voice-preview';
import { useSnapshotActions } from '@/stores/snapshot-store';
import type { CharacterVoiceSetting } from '@/types/character-types';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';

import {
  buildNextWithInferenceMerge,
  buildNextWithInferenceReset,
  buildNextWithVoiceChange,
  extractInference,
  getLanguageEntry,
} from './character-voice-setting-helpers';
import { useCharacterVoicePreview } from './use-character-voice-preview';

const log = createLogger('Editor', 'VoiceSettingTabPanel');

function detectChangedField(
  prev: VoiceInferenceParamsValue,
  next: VoiceInferenceParamsValue,
): keyof VoiceInferenceParamsValue | null {
  const keys: Array<keyof VoiceInferenceParamsValue> = [
    'speed',
    'stability',
    'similarity',
    'exaggeration',
    'speaker_boost',
  ];
  for (const k of keys) {
    if (prev[k] !== next[k]) return k;
  }
  return null;
}

export interface VoiceSettingTabPanelProps {
  characterKey: string;
  voiceSetting: CharacterVoiceSetting | null;
}

export function VoiceSettingTabPanel({
  characterKey,
  voiceSetting,
}: VoiceSettingTabPanelProps) {
  const { updateCharacterVoiceSetting } = useSnapshotActions();
  const {
    playingLangCode,
    generatingLangCode,
    previewError,
    requestPreview,
    setPlayingLang,
    clearError,
  } = useCharacterVoicePreview(characterKey);

  // Latest voiceSetting for debounced/stale-closure-safe handlers.
  const vsRef = React.useRef<CharacterVoiceSetting | null>(voiceSetting);
  React.useEffect(() => {
    vsRef.current = voiceSetting;
  }, [voiceSetting]);

  const inference = React.useMemo<VoiceInferenceParamsValue>(
    () => extractInference(voiceSetting),
    [voiceSetting],
  );

  const voiceId = voiceSetting?.voice_id ?? null;

  const handleVoiceChange = React.useCallback(
    (nextVoiceId: string) => {
      const current = vsRef.current;
      const next = buildNextWithVoiceChange(current, nextVoiceId);
      log.info('handleVoiceChange', 'voice set + invalidate previews', { characterKey });
      updateCharacterVoiceSetting(characterKey, next);
    },
    [characterKey, updateCharacterVoiceSetting],
  );

  const handleInferenceChange = React.useCallback(
    (next: VoiceInferenceParamsValue) => {
      const current = vsRef.current;
      const changedField = detectChangedField(extractInference(current), next);
      if (!changedField) {
        log.debug('handleInferenceChange', 'no diff — ignoring');
        return;
      }

      // Local Zustand write is synchronous and cheap; commit on every tick so the
      // controlled slider thumb tracks drag smoothly. Network save is handled by
      // autoSaveSnapshot (decoupled).
      log.debug('handleInferenceChange', 'param changed', { field: String(changedField) });
      const merged = buildNextWithInferenceMerge(current, next);
      updateCharacterVoiceSetting(characterKey, merged);
    },
    [characterKey, updateCharacterVoiceSetting],
  );

  const handleInferenceReset = React.useCallback(() => {
    const current = vsRef.current;
    const next = buildNextWithInferenceReset(current);
    log.info('handleInferenceReset', 'reset inference to defaults + clear previews');
    updateCharacterVoiceSetting(characterKey, next);
  }, [characterKey, updateCharacterVoiceSetting]);

  const handleRequestPreview = React.useCallback(
    (langCode: string) => {
      log.info('handleRequestPreview', 'preview requested', { langCode });
      void requestPreview(langCode);
    },
    [requestPreview],
  );

  const handlePlayStart = React.useCallback(
    (langCode: string) => {
      log.debug('handlePlayStart', 'single-active player', { langCode });
      setPlayingLang(langCode);
    },
    [setPlayingLang],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Voice
            </p>
            <VoiceSelector
              groupByLanguage
              value={voiceId}
              onChange={handleVoiceChange}
              disabled={generatingLangCode !== null}
            />
          </div>

          <Separator />

          <VoiceInferenceParams
            value={inference}
            onChange={handleInferenceChange}
            onReset={handleInferenceReset}
            disabled={generatingLangCode !== null}
          />

          <Separator />

          <div className="flex flex-col gap-5">
            {VOICE_LANGUAGES.map((lang) => {
              const entry = getLanguageEntry(voiceSetting, lang.code);
              const errForLang =
                previewError && previewError.langCode === lang.code
                  ? previewError.message
                  : null;
              const showTooltip = !voiceId && !generatingLangCode;

              const previewCard = (
                <VoicePreviewCard
                  languageCode={lang.code}
                  voiceId={voiceId}
                  mediaUrl={entry?.media_url ?? null}
                  isGenerating={generatingLangCode === lang.code}
                  isActivePlayer={playingLangCode === lang.code}
                  onRequestPreview={() => handleRequestPreview(lang.code)}
                  onPlayStart={() => handlePlayStart(lang.code)}
                />
              );

              return (
                <section
                  key={lang.code}
                  className={cn('flex flex-col gap-3 border-b pb-5 last:border-b-0')}
                  aria-label={`Voice preview for ${lang.label}`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider">{lang.label}</h3>

                  {showTooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>{previewCard}</div>
                      </TooltipTrigger>
                      <TooltipContent>Chọn voice trước</TooltipContent>
                    </Tooltip>
                  ) : (
                    previewCard
                  )}

                  {errForLang ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      <span className="flex-1 leading-relaxed">{errForLang}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => {
                          log.info('error dismissed', 'user clicked X', { langCode: lang.code });
                          clearError();
                        }}
                        aria-label="Dismiss error"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
