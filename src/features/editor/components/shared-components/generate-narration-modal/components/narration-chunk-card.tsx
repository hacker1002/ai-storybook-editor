// narration-chunk-card.tsx — Single-chunk render surface for the
// GenerateNarrationModal. "Dumb" component: props in, callbacks out.
// Spec: ai-storybook-design/component/editor-page/objects-creative-space/07-01-narration-chunk-card.md

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  UserSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { InlineAudioPlayer } from '@/features/voices/components/voice-preview/inline-audio-player';
import { VoiceInferenceParams } from '@/features/voices/components/voice-inference-params/voice-inference-params';
import { DEFAULT_INFERENCE_PARAMS } from '@/constants/config-constants';
import type { NarratorInferenceParams } from '@/types/editor';

import {
  useActivePlayerId,
  getPlaybackBusActions,
} from '../audio-playback-bus';
import { errorMessageFor } from '../helpers/narration-error-messages';
import {
  hasFieldError,
  validateChunk,
} from '../helpers/validate-chunk';
import { ChunkScriptTextarea } from './chunk-script-textarea';
import { ChunkVersionsList } from './chunk-versions-list';
import { ChunkVoicePicker } from './chunk-voice-picker';
import type {
  ChunkDraft,
  InferenceParams,
  TextboxAudioResult,
  Voice,
  VoiceOption,
} from './chunk-types';

const log = createLogger('NarrationChunkCard', 'Component');

// ── Props ────────────────────────────────────────────────────────────────────

export interface NarrationChunkCardProps {
  chunk: ChunkDraft;
  index: number;
  totalChunks: number;
  voiceOptions: VoiceOption[];
  voicesById: Map<string, Voice>;
  currentLanguage: string;

  onScriptChange: (next: string) => void;
  onVoiceChange: (voice_id: string) => void;
  onParamChange: (partial: Partial<InferenceParams>) => void;
  onResetParams: () => void;
  onSelectResult: (originalIdx: number) => void;
  onToggleExpanded: () => void;
  onToggleAdvance: () => void;
  onGenerate: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLLAPSED_PREVIEW_LEN = 60;

function buildScriptPreview(script: string): string {
  const trimmed = script.trim();
  if (trimmed.length === 0) return '(empty)';
  if (trimmed.length <= COLLAPSED_PREVIEW_LEN) return trimmed;
  return `${trimmed.slice(0, COLLAPSED_PREVIEW_LEN)}…`;
}

/** Find selected result in chunk; null when results empty or invariant broken. */
function findSelected(
  results: TextboxAudioResult[],
): { result: TextboxAudioResult; originalIdx: number } | null {
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r && r.is_selected) return { result: r, originalIdx: i };
  }
  return null;
}

// ── Sub-views ────────────────────────────────────────────────────────────────

interface CollapsedRowProps {
  index: number;
  total: number;
  preview: string;
  voiceLabel: string | null;
  showWarn: boolean;
  onToggle: () => void;
  bodyId: string;
}

function CollapsedRow({
  index,
  total,
  preview,
  voiceLabel,
  showWarn,
  onToggle,
  bodyId,
}: CollapsedRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={false}
      aria-controls={bodyId}
      aria-label={`Toggle chunk ${index + 1} of ${total}`}
      className="flex h-12 w-full items-center gap-3 rounded-lg border bg-background px-3 text-left transition-colors hover:bg-muted/30"
    >
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <UserSquare
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-label={voiceLabel ?? 'No voice'}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{preview}</span>
      {showWarn ? (
        <span
          role="status"
          aria-live="polite"
          aria-label="Out of sync"
          className="shrink-0 text-amber-500"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export function NarrationChunkCard({
  chunk,
  index,
  totalChunks,
  voiceOptions,
  voicesById,
  onScriptChange,
  onVoiceChange,
  onParamChange,
  onResetParams,
  onSelectResult,
  onToggleExpanded,
  onToggleAdvance,
  onGenerate,
}: NarrationChunkCardProps) {
  const myPlayerId = `chunk:${chunk.client_id}`;
  const bodyId = `chunk-${chunk.client_id}-body`;
  const advanceId = `chunk-${chunk.client_id}-advance`;

  // ── Logging mount/unmount (no script content) ──
  useEffect(() => {
    log.info('mount', 'card mounted', {
      index,
      client_id: chunk.client_id,
      hasResults: chunk.results.length > 0,
      scriptLength: chunk.script.length,
    });
    return () => {
      log.info('unmount', 'card unmounted', {
        index,
        client_id: chunk.client_id,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived ──
  const validation = useMemo(
    () => validateChunk(chunk, voicesById),
    [chunk, voicesById],
  );

  const selectedEntry = findSelected(chunk.results);
  const selected = selectedEntry?.result ?? null;

  const scriptPreview = buildScriptPreview(chunk.script);
  // 3 derived sync flags (DB-CHANGELOG 2026-04-29 — split script_synced/params_synced)
  const hasResults = chunk.results.length > 0;
  const isScriptSyncStale = !chunk.script_synced && hasResults;
  const isParamsSyncStale = !chunk.params_synced && hasResults;
  const isAnySyncStale = isScriptSyncStale || isParamsSyncStale;

  log.debug('render', 'sync flags', {
    client_id: chunk.client_id,
    isScriptSyncStale,
    isParamsSyncStale,
  });

  // Voice display label (for collapsed icon tooltip).
  const voiceLabel = chunk.voice_id
    ? voicesById.get(chunk.voice_id)?.name ?? null
    : null;

  // ── Auto-play discriminator (token-based) ──
  // Auto-play fires only when the parent bumps `chunk.ui.autoPlayToken` —
  // which happens exclusively in handleGenerateChunk's success path. Mount,
  // expand, manual select of older results, and reopen-with-prefill no longer
  // trigger playback.
  const lastTokenRef = useRef<number | undefined>(chunk.ui.autoPlayToken);
  const [autoPlayKey, setAutoPlayKey] = useState(0);

  useEffect(() => {
    const token = chunk.ui.autoPlayToken;
    if (token == null || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    setAutoPlayKey((k) => k + 1);
    log.debug('autoPlay', 'token bumped, request play', {
      client_id: chunk.client_id,
      token,
    });
    getPlaybackBusActions().requestPlay(myPlayerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk.ui.autoPlayToken]);

  // Reset autoPlayKey when the chunk collapses. Without this, the local key
  // state survives the InlineAudioPlayer unmount; on re-expand the player
  // mounts with a non-zero key and its mount-time effect fires play().
  // Re-mount with key=0 → mount effect short-circuits → no spurious autoplay.
  useEffect(() => {
    if (!chunk.ui.isExpanded) setAutoPlayKey(0);
  }, [chunk.ui.isExpanded]);

  // ── Playback bus consumer: mark this player active/inactive for InlineAudioPlayer ──
  const activePlayerId = useActivePlayerId();
  const isActive = activePlayerId === myPlayerId;
  const handleInlinePlayStart = () => {
    getPlaybackBusActions().requestPlay(myPlayerId);
  };

  // ── Inference params adapter for VoiceInferenceParams (per-chunk has no
  //    speaker_boost; we inject a stub default to satisfy the shared shape) ──
  const inferenceValue: NarratorInferenceParams = {
    speed: chunk.speed,
    stability: chunk.stability,
    similarity: chunk.similarity,
    exaggeration: chunk.exaggeration,
    speaker_boost: DEFAULT_INFERENCE_PARAMS.speaker_boost, // not persisted; UI hidden
  };

  const handleInferenceChange = (next: NarratorInferenceParams) => {
    const partial: Partial<InferenceParams> = {};
    if (next.speed !== chunk.speed) partial.speed = next.speed;
    if (next.stability !== chunk.stability) partial.stability = next.stability;
    if (next.similarity !== chunk.similarity)
      partial.similarity = next.similarity;
    if (next.exaggeration !== chunk.exaggeration)
      partial.exaggeration = next.exaggeration;
    if (Object.keys(partial).length > 0) onParamChange(partial);
  };

  const handleResetParams = () => {
    log.debug('resetParams', 'reset clicked', { client_id: chunk.client_id });
    onResetParams();
  };

  // ── Validation flags ──
  const scriptHasError = hasFieldError(validation, 'script');
  const isScriptEmpty = chunk.script.trim().length === 0;
  const isScriptTooLong = validation.errors.some(
    (e) => e.code === 'script_too_long',
  );
  const generateDisabled = !validation.ok || chunk.ui.isGenerating;

  // ── Collapsed render ──
  if (!chunk.ui.isExpanded) {
    return (
      <CollapsedRow
        index={index}
        total={totalChunks}
        preview={scriptPreview}
        voiceLabel={voiceLabel}
        showWarn={isAnySyncStale || chunk.ui.error != null}
        onToggle={() => {
          log.debug('toggleExpanded', 'click → expand', {
            client_id: chunk.client_id,
          });
          onToggleExpanded();
        }}
        bodyId={bodyId}
      />
    );
  }

  // ── Expanded render ──
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          log.debug('toggleExpanded', 'click → collapse', {
            client_id: chunk.client_id,
          });
          onToggleExpanded();
        }}
        aria-expanded
        aria-controls={bodyId}
        aria-label={`Toggle chunk ${index + 1} of ${totalChunks}`}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        <UserSquare
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-label={voiceLabel ?? 'No voice'}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{scriptPreview}</span>
      </button>

      <div id={bodyId} className="flex flex-col gap-4">
        {/* Player + LATEST grid OR empty placeholder */}
        {chunk.results.length > 0 && selected ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex min-h-[152px] items-center rounded-md bg-muted/30 p-2">
              <InlineAudioPlayer
                src={selected.url}
                isActive={isActive}
                autoPlayKey={autoPlayKey}
                onPlayStart={handleInlinePlayStart}
                className="w-full bg-transparent border-0"
              />
            </div>
            <ChunkVersionsList
              results={chunk.results}
              onSelectResult={(idx) => {
                log.debug('selectResult', 'bubble up', {
                  client_id: chunk.client_id,
                  originalIdx: idx,
                });
                onSelectResult(idx);
              }}
              chunkIndex={index}
            />
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No audio yet — click Generate to create the first version
          </div>
        )}

        {/* SCRIPT row: label + sync flag (left) | VoicePicker (right) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Script
          </span>
          {isScriptSyncStale ? (
            <span
              role="status"
              aria-live="polite"
              aria-label="Script or voice changed since last generation"
              className="inline-flex items-center gap-1 text-xs text-amber-600"
            >
              <AlertTriangle className="h-3 w-3" />
              Out of sync
            </span>
          ) : null}
          <span className="ml-auto" />
          <ChunkVoicePicker
            value={chunk.voice_id || null}
            onChange={onVoiceChange}
            options={voiceOptions}
            voicesById={voicesById}
            disabled={chunk.ui.isGenerating}
            chunkIndex={index}
          />
        </div>

        <ChunkScriptTextarea
          value={chunk.script}
          onChange={onScriptChange}
          disabled={chunk.ui.isGenerating}
          chunkIndex={index}
          isTooLong={isScriptTooLong}
          isEmpty={isScriptEmpty}
        />

        {/* Generate CTA */}
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            onClick={onGenerate}
            disabled={generateDisabled}
            aria-busy={chunk.ui.isGenerating}
            aria-label={`Generate narration for chunk ${index + 1}`}
            className="h-10 gap-2 px-8"
          >
            <Sparkles className="h-4 w-4" />
            {chunk.ui.isGenerating ? 'Generating…' : 'Generate'}
          </Button>
          {chunk.ui.error ? (
            <span className="text-xs text-destructive" role="alert">
              {errorMessageFor({ errorCode: chunk.ui.error.errorCode })}
            </span>
          ) : null}
          {/* Subtle hint on validation cause when not generating */}
          {!chunk.ui.isGenerating && !validation.ok ? (
            <span className="text-xs text-muted-foreground">
              {scriptHasError && isScriptEmpty
                ? 'Enter narration text first.'
                : hasFieldError(validation, 'voice')
                  ? 'Choose a voice to enable Generate.'
                  : null}
            </span>
          ) : null}
        </div>

        {/* ADVANCE toggle */}
        <button
          type="button"
          onClick={() => {
            log.debug('toggleAdvance', 'click', {
              client_id: chunk.client_id,
              next: !chunk.ui.isAdvanceOpen,
            });
            onToggleAdvance();
          }}
          aria-expanded={chunk.ui.isAdvanceOpen}
          aria-controls={advanceId}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/30"
        >
          {chunk.ui.isAdvanceOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>Advance</span>
          {isParamsSyncStale ? (
            <span
              role="status"
              aria-live="polite"
              aria-label="Inference parameters changed since last generation"
              className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 normal-case tracking-normal"
            >
              <AlertTriangle className="h-3 w-3" />
              Out of sync
            </span>
          ) : null}
        </button>

        {chunk.ui.isAdvanceOpen ? (
          <div
            id={advanceId}
            className={cn(
              'rounded-md bg-muted/20 p-3',
              chunk.ui.isGenerating && 'pointer-events-none opacity-60',
            )}
          >
            <VoiceInferenceParams
              value={inferenceValue}
              onChange={handleInferenceChange}
              onReset={handleResetParams}
              disabled={chunk.ui.isGenerating}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
