// config-narrator-settings.tsx
// Root panel: ElevenLabs inference params + per-language voice pickers (5 langs).
// Orchestrates preview hook (single-active player) and debounces slider-driven updates.

import * as React from 'react';

import { Separator } from '@/components/ui/separator';
import {
  DEFAULT_INFERENCE_PARAMS,
  DEFAULT_NARRATOR,
  NARRATOR_LANGUAGES,
} from '@/constants/config-constants';
import {
  useBookActions,
  useBookNarrator,
  useCurrentBook,
} from '@/stores/book-store';
import type { NarratorSettings } from '@/types/editor';
import { createLogger } from '@/utils/logger';
import { useDebouncedCallback } from '@/utils/use-debounced-callback';
import { VoiceInferenceParams } from '@/features/voices/components/voice-inference-params';
import type { VoiceInferenceParamsValue } from '@/features/voices/components/voice-inference-params';

import {
  extractInference,
  getLanguageEntry,
  buildNextNarratorWithVoiceChange,
} from './narrator-helpers';
import { useNarratorPreview } from './use-narrator-preview';
import { NarratorLanguageSection } from './narrator/narrator-language-section';

// Sliders are the only "continuous" surface — debounce these to avoid spamming updateBook.
// Chip-based speed + speaker_boost switch + voice select commit immediately (discrete events).
const CONTINUOUS_FIELDS: ReadonlyArray<keyof VoiceInferenceParamsValue> = [
  'stability',
  'similarity',
  'style_exaggeration',
];

const DEBOUNCE_MS = 300;

const log = createLogger('Editor', 'ConfigNarratorSettings');

/** Detect which inference field (if any) changed between two snapshots. */
function detectChangedField(
  prev: VoiceInferenceParamsValue,
  next: VoiceInferenceParamsValue,
): keyof VoiceInferenceParamsValue | null {
  const keys: Array<keyof VoiceInferenceParamsValue> = [
    'speed',
    'stability',
    'similarity',
    'style_exaggeration',
    'speaker_boost',
  ];
  for (const k of keys) {
    if (prev[k] !== next[k]) return k;
  }
  return null;
}

export function ConfigNarratorSettings() {
  const book = useCurrentBook();
  const narrator = useBookNarrator();
  const { updateBook } = useBookActions();
  const {
    playingLangCode,
    generatingLangCode,
    previewError,
    requestPreview,
    setPlayingLang,
    clearError,
  } = useNarratorPreview();

  // Latest narrator snapshot for handlers — avoids stale closures during debounced commits.
  const narratorRef = React.useRef<NarratorSettings | null>(narrator);
  React.useEffect(() => {
    narratorRef.current = narrator;
  }, [narrator]);

  // Derive inference params (memoized — stable unless narrator values actually change).
  const inference = React.useMemo<VoiceInferenceParamsValue>(
    () => extractInference(narrator),
    [narrator],
  );

  // Debounced commit for slider-driven updates (see CONTINUOUS_FIELDS).
  const debouncedCommit = useDebouncedCallback((next: NarratorSettings) => {
    if (!book) return;
    log.debug('debouncedCommit', 'flushing narrator update', { bookId: book.id });
    void updateBook(book.id, { narrator: next });
  }, DEBOUNCE_MS);

  const handleInferenceChange = React.useCallback(
    (next: VoiceInferenceParamsValue) => {
      if (!book) {
        log.warn('handleInferenceChange', 'no current book');
        return;
      }
      // Seed from DEFAULT_NARRATOR on first interaction so language entries survive future edits.
      const current = narratorRef.current ?? DEFAULT_NARRATOR;
      const changedField = detectChangedField(extractInference(current), next);
      if (!changedField) {
        log.debug('handleInferenceChange', 'no diff — ignoring');
        return;
      }

      // Per Validation S1: do NOT wipe media_url — preserve prior language entries.
      const merged: NarratorSettings = { ...current, ...next };

      const isContinuous = CONTINUOUS_FIELDS.includes(changedField);
      log.info('handleInferenceChange', 'param changed', {
        field: String(changedField),
        debounced: isContinuous,
      });

      if (isContinuous) {
        debouncedCommit(merged);
      } else {
        void updateBook(book.id, { narrator: merged });
      }
    },
    [book, debouncedCommit, updateBook],
  );

  const handleInferenceReset = React.useCallback(() => {
    if (!book) return;
    // Preserve language entries (media_url kept per Validation S1); reset the 5 inference fields only.
    const current = narratorRef.current ?? DEFAULT_NARRATOR;
    const next: NarratorSettings = { ...current, ...DEFAULT_INFERENCE_PARAMS };
    log.info('handleInferenceReset', 'reset to defaults (media_url preserved)');
    void updateBook(book.id, { narrator: next });
  }, [book, updateBook]);

  const handleVoiceChange = React.useCallback(
    (langCode: string, voiceId: string) => {
      if (!book) return;
      const current = narratorRef.current ?? DEFAULT_NARRATOR;
      const next = buildNextNarratorWithVoiceChange(current, langCode, voiceId);
      log.info('handleVoiceChange', 'voice set', { langCode });
      void updateBook(book.id, { narrator: next });
    },
    [book, updateBook],
  );

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

  if (!book) {
    log.debug('render', 'no book — rendering null');
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Narrator Settings</h3>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        <VoiceInferenceParams
          value={inference}
          onChange={handleInferenceChange}
          onReset={handleInferenceReset}
          disabled={generatingLangCode !== null}
        />

        <Separator />

        <div className="flex flex-col gap-5">
          {NARRATOR_LANGUAGES.map((lang) => (
            <NarratorLanguageSection
              key={lang.code}
              langCode={lang.code}
              langLabel={lang.label}
              entry={getLanguageEntry(narrator, lang.code)}
              isGenerating={generatingLangCode === lang.code}
              isActivePlayer={playingLangCode === lang.code}
              error={
                previewError && previewError.langCode === lang.code
                  ? previewError.message
                  : null
              }
              onVoiceChange={(voiceId) => handleVoiceChange(lang.code, voiceId)}
              onRequestPreview={() => handleRequestPreview(lang.code)}
              onPlayStart={() => handlePlayStart(lang.code)}
              onDismissError={clearError}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
