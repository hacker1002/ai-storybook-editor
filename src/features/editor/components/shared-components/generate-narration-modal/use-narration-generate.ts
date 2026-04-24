// use-narration-generate.ts — Encapsulates the generate flow for the narration
// modal: validate → resolve → POST → persist → auto-play → onGenerated.
// Extracted from the modal shell to keep the root file < 400 LOC and to isolate
// the async + AbortController lifecycle in one place.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';
import { callNarrateScript } from '@/apis/narrate-script-api';
import type {
  TextboxAudio,
  TextboxAudioMedia,
  TextboxAudioSettings,
} from '@/types/spread-types';
import {
  mapSettingsToApiPayload,
  OUTPUT_FORMAT,
} from './helpers/settings-mapper';
import { mapApiSegmentToSnapshot } from './helpers/segment-mapper';
import { errorMessageFor } from './helpers/narration-error-messages';
import type { ResolveResult } from './helpers/script-resolver';

const log = createLogger('GenerateNarrationModal', 'UseNarrationGenerate');

export interface UseNarrationGenerateParams {
  isValid: boolean;
  resolveResult: ResolveResult;
  editableScript: string;
  settings: TextboxAudioSettings;
  currentSignature: string;
  onGenerated: (audio: TextboxAudio) => void;
}

export interface UseNarrationGenerateReturn {
  media: TextboxAudioMedia | null;
  setMedia: React.Dispatch<React.SetStateAction<TextboxAudioMedia | null>>;
  isGenerating: boolean;
  previewError: string | null;
  setPreviewError: React.Dispatch<React.SetStateAction<string | null>>;
  lastGeneratedSignature: string | null;
  setLastGeneratedSignature: React.Dispatch<React.SetStateAction<string | null>>;
  handleGenerate: () => Promise<void>;
  abortInFlight: () => void;
}

/**
 * Owns media/signature/isGenerating/previewError state + the POST flow.
 * AbortController is recreated per call and aborted on unmount or force-pop.
 */
export function useNarrationGenerate(
  params: UseNarrationGenerateParams,
): UseNarrationGenerateReturn {
  const {
    isValid,
    resolveResult,
    editableScript,
    settings,
    currentSignature,
    onGenerated,
  } = params;

  const [media, setMedia] = useState<TextboxAudioMedia | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<
    string | null
  >(null);

  const abortRef = useRef<AbortController | null>(null);

  const abortInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      log.debug('abortInFlight', 'aborted pending request', {});
    }
  }, []);

  // Abort on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!isValid) {
      log.debug('handleGenerate', 'skip: invalid state', {});
      return;
    }
    if (!resolveResult.ok) {
      log.debug('handleGenerate', 'skip: resolve errors', {
        count: resolveResult.errors.length,
      });
      return;
    }

    // Cancel any prior in-flight request before starting a new one.
    abortInFlight();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setPreviewError(null);
    log.info('handleGenerate', 'start', {
      scriptLength: resolveResult.value.length,
      model: settings.model,
    });

    try {
      const result = await callNarrateScript(
        {
          script: resolveResult.value,
          modelId: settings.model as 'eleven_v3',
          settings: mapSettingsToApiPayload(settings),
          outputFormat: OUTPUT_FORMAT,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) {
        log.debug('handleGenerate', 'aborted mid-flight', {});
        return;
      }

      if (!result.success) {
        setPreviewError(errorMessageFor({ errorCode: result.errorCode }));
        log.error('handleGenerate', 'api failed', {
          errorCode: result.errorCode,
          httpStatus: result.httpStatus,
        });
        return;
      }

      const newMedia: TextboxAudioMedia = {
        url: result.data.audioUrl,
        duration_ms: result.data.durationMs,
        output_format: OUTPUT_FORMAT,
        path_key: result.meta?.pathKey ?? '',
        script_synced: true,
        generated_at: new Date().toISOString(),
        segments: result.data.segments.map(mapApiSegmentToSnapshot),
        raw_alignment: result.data.rawAlignment,
      };

      setMedia(newMedia);
      setLastGeneratedSignature(currentSignature);
      log.info('handleGenerate', 'success', {
        durationMs: newMedia.duration_ms,
        segmentCount: newMedia.segments.length,
      });

      // InlineAudioPlayer owns its own <audio> and reloads on `src` prop
      // change. No manual play() here — user clicks Play on the preview.

      onGenerated({
        script: editableScript,
        settings,
        media: newMedia,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        log.debug('handleGenerate', 'aborted via signal catch', {});
        return;
      }
      setPreviewError(errorMessageFor({ errorCode: 'UNKNOWN' }));
      log.error('handleGenerate', 'exception', {
        msg: String(err).slice(0, 100),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsGenerating(false);
    }
  }, [
    abortInFlight,
    currentSignature,
    editableScript,
    isValid,
    onGenerated,
    resolveResult,
    settings,
  ]);

  return {
    media,
    setMedia,
    isGenerating,
    previewError,
    setPreviewError,
    lastGeneratedSignature,
    setLastGeneratedSignature,
    handleGenerate,
    abortInFlight,
  };
}
