import { useCallback, useEffect, useRef, useState } from 'react';

import {
  callNarrateScript,
  type NarrateScriptErrorCode,
  type NarrateScriptSettings,
} from '@/apis/narrate-script-api';
import { PREVIEW_TEXTS } from '@/constants/config-constants';
import { getNarratorErrorMessage } from '@/features/editor/components/config-creative-space/narrator-error-messages';
import { useCharacterByKey, useSnapshotActions } from '@/stores/snapshot-store';
import { useVoicesStore } from '@/stores/voices-store';
import type { CharacterVoiceSetting } from '@/types/character-types';
import { createLogger } from '@/utils/logger';

import {
  buildNextWithMediaUrl,
  extractInference,
} from './character-voice-setting-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// useCharacterVoicePreview — preview orchestration for character voice setting.
// Validation S1: always-call API (align narrator). Backend dedupes SHA256.
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('Editor', 'CharacterVoicePreview');

export interface CharacterVoicePreviewError {
  langCode: string;
  code: NarrateScriptErrorCode | 'NO_VOICE' | 'VOICE_MISSING_ELEVEN_ID' | 'UNSUPPORTED_LANG';
  message: string;
}

export interface CharacterVoicePreviewApi {
  playingLangCode: string | null;
  generatingLangCode: string | null;
  previewError: CharacterVoicePreviewError | null;
  requestPreview: (langCode: string) => Promise<void>;
  setPlayingLang: (code: string | null) => void;
  clearError: () => void;
}

function buildApiSettings(vs: CharacterVoiceSetting | null): NarrateScriptSettings {
  const inference = extractInference(vs);
  return {
    stability: inference.stability,
    similarityBoost: inference.similarity,
    style: inference.exaggeration,
    speed: inference.speed,
    // speaker_boost intentionally omitted (ElevenLabs v3 doesn't accept it via this endpoint).
  };
}

export function useCharacterVoicePreview(
  characterKey: string,
): CharacterVoicePreviewApi {
  const character = useCharacterByKey(characterKey);
  const { updateCharacterVoiceSetting } = useSnapshotActions();

  const [playingLangCode, setPlayingLangCode] = useState<string | null>(null);
  const [generatingLangCode, setGeneratingLangCode] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<CharacterVoicePreviewError | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const clearError = useCallback(() => setPreviewError(null), []);

  const setPlayingLang = useCallback((code: string | null) => {
    log.debug('setPlayingLang', 'set', { code });
    setPlayingLangCode(code);
  }, []);

  const requestPreview = useCallback(
    async (langCode: string): Promise<void> => {
      log.info('requestPreview', 'start', { langCode, characterKey });

      if (!character) {
        log.warn('requestPreview', 'character not found');
        setPreviewError({
          langCode,
          code: 'VALIDATION_ERROR',
          message: getNarratorErrorMessage('VALIDATION_ERROR'),
        });
        return;
      }

      if (!PREVIEW_TEXTS[langCode]) {
        log.warn('requestPreview', 'no preview text for lang', { langCode });
        setPreviewError({
          langCode,
          code: 'UNSUPPORTED_LANG',
          message: 'Ngôn ngữ này chưa có nội dung preview.',
        });
        return;
      }

      const vs = character.voice_setting;
      if (!vs?.voice_id) {
        log.debug('requestPreview', 'no voice selected');
        setPreviewError({
          langCode,
          code: 'NO_VOICE',
          message: 'Chưa chọn giọng đọc.',
        });
        return;
      }

      const voices = useVoicesStore.getState().voices;
      const voice = voices.find((v) => v.id === vs.voice_id);
      if (!voice) {
        log.warn('requestPreview', 'voice not found in store', { voiceId: vs.voice_id });
        setPreviewError({
          langCode,
          code: 'VALIDATION_ERROR',
          message: 'Không tìm thấy giọng đọc trong hệ thống.',
        });
        return;
      }
      if (!voice.elevenId) {
        log.warn('requestPreview', 'voice missing eleven_id', { voiceId: voice.id });
        setPreviewError({
          langCode,
          code: 'VOICE_MISSING_ELEVEN_ID',
          message: 'Giọng đọc chưa có ID ElevenLabs, vui lòng chọn giọng khác.',
        });
        return;
      }

      const script = `@${voice.elevenId}: ${PREVIEW_TEXTS[langCode]}`;
      const settings = buildApiSettings(vs);

      if (abortRef.current) {
        log.debug('requestPreview', 'aborting previous request');
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setPreviewError(null);
      setGeneratingLangCode(langCode);

      try {
        const result = await callNarrateScript(
          { script, modelId: 'eleven_v3', settings },
          { signal: controller.signal },
        );

        if (abortRef.current !== controller) {
          log.debug('requestPreview', 'stale result ignored', { langCode });
          return;
        }

        if (!result.success) {
          if (result.errorCode === 'ABORT') {
            log.info('requestPreview', 'aborted', { langCode });
            return;
          }
          log.error('requestPreview', 'api failure', {
            langCode,
            errorCode: result.errorCode,
            httpStatus: result.httpStatus,
          });
          setPreviewError({
            langCode,
            code: result.errorCode,
            message: getNarratorErrorMessage(result.errorCode),
          });
          return;
        }

        const audioUrl = result.data.audioUrl;
        log.info('requestPreview', 'success', {
          langCode,
          durationMs: result.data.durationMs,
        });

        const nextVs = buildNextWithMediaUrl(vs, langCode, audioUrl);
        updateCharacterVoiceSetting(characterKey, nextVs);
        setPlayingLangCode(langCode);
      } catch (err) {
        log.error('requestPreview', 'unexpected error', {
          langCode,
          msg: err instanceof Error ? err.message.slice(0, 100) : String(err),
        });
        setPreviewError({
          langCode,
          code: 'UNKNOWN',
          message: getNarratorErrorMessage('UNKNOWN'),
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setGeneratingLangCode((cur) => (cur === langCode ? null : cur));
      }
    },
    [character, characterKey, updateCharacterVoiceSetting],
  );

  return {
    playingLangCode,
    generatingLangCode,
    previewError,
    requestPreview,
    setPlayingLang,
    clearError,
  };
}
