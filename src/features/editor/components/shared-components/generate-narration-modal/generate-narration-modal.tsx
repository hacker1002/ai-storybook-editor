// generate-narration-modal.tsx — Root shell for the narration generation modal.
// Composes Phase 2 helpers + Phase 3 sub-components + the shared
// VoiceInferenceParams. Owns editableScript/settings state + inline audio
// playback state; delegates the async generate flow to `useNarrationGenerate`.
//
// Interaction Layer: registers a `modal` slot (ADR-019) with captureClickOutside
// so Escape/outside-click close the modal without leaking to the item slot.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Sparkles, TriangleAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { useInteractionLayer } from '@/features/editor/contexts';
import { VoiceInferenceParams } from '@/features/voices/components/voice-inference-params/voice-inference-params';
import { useVoices } from '@/stores/voices-store';
import { useBookNarrator, useCurrentBook } from '@/stores/book-store';
import { useCharacters } from '@/stores/snapshot-store';
import type {
  TextboxAudio,
  TextboxAudioSettings,
} from '@/types/spread-types';
import { InlineAudioPlayer } from '@/features/voices/components/voice-preview/inline-audio-player';
import { ScriptEditor } from './components/script-editor/script-editor';
import { ScriptMeta } from './components/script-meta';
import { parseTurns } from './helpers/script-parser';
import { resolveScriptKeys } from './helpers/script-resolver';
import {
  DEFAULT_SETTINGS,
  MAX_SCRIPT_LENGTH,
} from './helpers/settings-mapper';
import { signatureOf } from './helpers/signature';
import { useNarrationGenerate } from './use-narration-generate';

const log = createLogger('GenerateNarrationModal', 'Component');

export interface GenerateNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  textboxTitle?: string;
  textboxText: string;
  existingAudio: TextboxAudio | null;
  currentLanguage: string;
  onGenerated: (audio: TextboxAudio) => void;
  /** Called once when local edits (script/settings) first diverge from the last
   *  generated media, so the parent can flip `audio.media.script_synced = false`. */
  onMarkStale?: () => void;
  /** Called on close with latest local script/settings if they diverge from the
   *  persisted audio — so unfinalized edits survive modal close/reopen. */
  onDraftSave?: (draft: { script: string; settings: TextboxAudioSettings }) => void;
}

export function GenerateNarrationModal({
  isOpen,
  onClose,
  textboxTitle,
  textboxText,
  existingAudio,
  currentLanguage,
  onGenerated,
  onMarkStale,
  onDraftSave,
}: GenerateNarrationModalProps) {
  // ── Local state ───────────────────────────────────────────────────────────
  const [editableScript, setEditableScript] = useState('');
  const [settings, setSettings] =
    useState<TextboxAudioSettings>(DEFAULT_SETTINGS);

  const dialogContentRef = useRef<HTMLDivElement>(null);

  // ── Store selectors ───────────────────────────────────────────────────────
  const voices = useVoices();
  const voicesById = useMemo(
    () => new Map(voices.map((v) => [v.id, v])),
    [voices],
  );
  const narrator = useBookNarrator();
  const currentBook = useCurrentBook();
  const originalLanguage = currentBook?.original_language ?? currentLanguage;
  const characters = useCharacters();
  const charactersByKey = useMemo(
    () => new Map(characters.map((c) => [c.key, c])),
    [characters],
  );

  // ── Derived (sync) ────────────────────────────────────────────────────────
  const resolveResult = useMemo(
    () =>
      resolveScriptKeys(editableScript, {
        narrator,
        charactersByKey,
        voicesById,
        currentLanguage,
        originalLanguage,
      }),
    [
      editableScript,
      narrator,
      charactersByKey,
      voicesById,
      currentLanguage,
      originalLanguage,
    ],
  );
  const resolvedLength = resolveResult.ok ? resolveResult.value.length : 0;
  const resolveErrors = resolveResult.ok ? [] : resolveResult.errors;
  const turnCount = useMemo(
    () => parseTurns(editableScript).length,
    [editableScript],
  );
  // Staleness is a stored flag on the media (source of truth per product spec):
  // flipped false by any text/script/settings change, true on successful generate.
  const isStoredStale = existingAudio?.media?.script_synced === false;
  const currentSignature = useMemo(
    () => signatureOf(editableScript, settings),
    [editableScript, settings],
  );
  const isValid =
    turnCount >= 1 &&
    resolvedLength <= MAX_SCRIPT_LENGTH &&
    resolveErrors.length === 0;

  // ── Generate flow (media + signature + async) ─────────────────────────────
  const {
    media,
    setMedia,
    isGenerating,
    previewError,
    setPreviewError,
    lastGeneratedSignature,
    setLastGeneratedSignature,
    handleGenerate,
    abortInFlight,
  } = useNarrationGenerate({
    isValid,
    resolveResult,
    editableScript,
    settings,
    currentSignature,
    onGenerated,
  });

  const isDirty =
    media != null &&
    lastGeneratedSignature != null &&
    currentSignature !== lastGeneratedSignature;

  // ── Propagate stale flag to parent ────────────────────────────────────────
  // Fire `onMarkStale` once when the local signature first diverges from the
  // last-generated one AND the stored media still claims synced. Parent flips
  // `audio.media.script_synced = false` so the flag persists across closes.
  useEffect(() => {
    if (!isDirty) return;
    if (existingAudio?.media?.script_synced === false) return;
    onMarkStale?.();
    log.debug('markStale', 'signature diverged — flagged parent', {});
    // deps intentionally narrow: we only want the edge trigger, not re-fires
    // on every keystroke once parent has already flipped the flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, existingAudio?.media?.script_synced]);

  // ── Pre-fill on open ──────────────────────────────────────────────────────
  // Run only on the open transition — not on every prop-reference change.
  // Parent re-renders during editing (e.g., onScriptEdited → onUpdate) create a
  // new `existingAudio` reference which would otherwise clobber `editableScript`
  // back to the stored value mid-edit. Latest props are captured via refs so the
  // one-shot prefill sees current data without re-subscribing.
  const prefillPropsRef = useRef({ existingAudio, textboxText });
  prefillPropsRef.current = { existingAudio, textboxText };
  useEffect(() => {
    if (!isOpen) return;
    const { existingAudio, textboxText } = prefillPropsRef.current;
    if (existingAudio) {
      setEditableScript(existingAudio.script);
      setSettings({ ...DEFAULT_SETTINGS, ...existingAudio.settings });
      setMedia(existingAudio.media);
      setLastGeneratedSignature(
        existingAudio.media
          ? signatureOf(existingAudio.script, { ...DEFAULT_SETTINGS, ...existingAudio.settings })
          : null,
      );
      log.debug('prefill', 'restored from existingAudio', {
        hasMedia: existingAudio.media != null,
      });
    } else {
      const trimmed = textboxText.trim();
      const initial = trimmed ? `@narrator: ${trimmed}` : '';
      setEditableScript(initial);
      setSettings(DEFAULT_SETTINGS);
      setMedia(null);
      setLastGeneratedSignature(null);
      log.debug('prefill', 'fresh wrap from textboxText', {
        hasText: trimmed.length > 0,
      });
    }
    setPreviewError(null);
    log.info('open', 'modal opened', {
      hasExistingAudio: existingAudio != null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isGenerating) {
      log.debug('handleClose', 'blocked: generating', {});
      return;
    }
    // Persist unfinalized edits so they survive close/reopen. Compare against
    // the stored audio to avoid a no-op update when nothing changed.
    const storedScript = existingAudio?.script ?? '';
    const storedSettings = existingAudio?.settings;
    const scriptChanged = editableScript !== storedScript;
    const settingsChanged =
      !storedSettings ||
      signatureOf('', settings) !== signatureOf('', storedSettings);
    if (onDraftSave && (scriptChanged || settingsChanged)) {
      onDraftSave({ script: editableScript, settings });
      log.info('close', 'draft saved', { scriptChanged, settingsChanged });
    }
    log.info('close', 'modal closed', {});
    onClose();
  }, [
    isGenerating,
    onClose,
    existingAudio,
    editableScript,
    settings,
    onDraftSave,
  ]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) handleClose();
    },
    [handleClose],
  );

  const handleSettingsChange = useCallback(
    (next: TextboxAudioSettings) => {
      setSettings((prev) => ({ ...prev, ...next }));
    },
    [],
  );

  const handleResetSettings = useCallback(() => {
    setSettings((prev) => ({ ...DEFAULT_SETTINGS, seed: prev.seed }));
  }, []);

  const handleScriptChange = useCallback((next: string) => {
    setEditableScript(next);
  }, []);

  // No-op commit hook (kept for ScriptEditor contract; staleness propagation
  // flows through the `onMarkStale` effect above on signature divergence).
  const handleScriptCommit = useCallback(() => {}, []);

// ── Interaction layer registration ────────────────────────────────────────
  useInteractionLayer(
    'modal',
    isOpen
      ? {
          id: 'generate-narration-modal',
          ref: dialogContentRef,
          hotkeys: ['Escape'],
          onHotkey: (key) => {
            if (key === 'Escape' && !isGenerating) handleClose();
          },
          onClickOutside: () => {
            if (!isGenerating) handleClose();
          },
          captureClickOutside: true,
          portalSelectors: [
            '[data-radix-popper-content-wrapper]',
            '[data-radix-select-content]',
            '[role="listbox"]',
          ],
          dropdownSelectors: [
            '[data-radix-popper-content-wrapper]',
            '[data-radix-select-content]',
          ],
          onForcePop: () => {
            abortInFlight();
            onClose();
          },
        }
      : null,
  );

  // ── Render ────────────────────────────────────────────────────────────────
  // Map TextboxAudioSettings → VoiceInferenceParamsValue (NarratorInferenceParams shape).
  const inferenceValue = useMemo(
    () => ({
      speed: settings.speed,
      stability: settings.stability,
      similarity: settings.similarity,
      style_exaggeration: settings.style_exaggeration,
      speaker_boost: settings.speaker_boost,
    }),
    [
      settings.speed,
      settings.stability,
      settings.similarity,
      settings.style_exaggeration,
      settings.speaker_boost,
    ],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {textboxTitle ?? 'Textbox'} - Narration
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {media?.url ? (
            <InlineAudioPlayer
              key={`${media.url}#${media.generated_at}`}
              src={media.url}
              isActive
              onPlayStart={() => {}}
            />
          ) : (
            <div className="flex h-12 items-center justify-center rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              No audio yet — click Generate to synthesize
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!isValid || isGenerating}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating ? 'Generating…' : 'Generate'}
            </Button>
            {previewError && (
              <p className={cn('text-center text-xs font-medium text-destructive')}>
                {previewError}
              </p>
            )}
          </div>

          <VoiceInferenceParams
            title="Voice settings"
            value={inferenceValue}
            onChange={(next) =>
              handleSettingsChange({
                ...settings,
                speed: next.speed,
                stability: next.stability,
                similarity: next.similarity,
                style_exaggeration: next.style_exaggeration,
                speaker_boost: next.speaker_boost,
              })
            }
            onReset={handleResetSettings}
            disabled={isGenerating}
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Textbox text
              </p>
              {isStoredStale && (
                <span
                  role="status"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                >
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  Out of sync — regenerate audio
                </span>
              )}
            </div>
            <div className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground min-h-[2.5rem]">
              {textboxText?.trim() ? textboxText : (
                <span className="italic opacity-70">(empty)</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider">Script</p>
            <ScriptEditor
              value={editableScript}
              onChange={handleScriptChange}
              onCommit={handleScriptCommit}
              narrator={narrator}
              characters={characters}
              currentLanguage={currentLanguage}
              placeholder="Type narration. Use @narrator or @{character_key} for multi-turn dialog."
            />
            <ScriptMeta
              resolvedLength={resolvedLength}
              maxLength={MAX_SCRIPT_LENGTH}
              turnCount={turnCount}
              resolveErrors={resolveErrors}
              isDirty={isDirty}
            />
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GenerateNarrationModal;
