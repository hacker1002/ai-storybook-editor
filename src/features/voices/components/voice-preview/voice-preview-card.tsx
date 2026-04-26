import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PREVIEW_TEXTS } from '@/constants/config-constants';
import { createLogger } from '@/utils/logger';

import { InlineAudioPlayer } from './inline-audio-player';

// ─────────────────────────────────────────────────────────────────────────────
// VoicePreviewCard — 3-state preview widget (pure controlled component).
//   1. idle         → Preview button (disabled if !voiceId || isGenerating).
//   2. generating   → disabled button with spinner + "Generating...".
//   3. has-media    → InlineAudioPlayer below Preview button.
// ─────────────────────────────────────────────────────────────────────────────

const log = createLogger('VoicePreview', 'VoicePreviewCard');

export interface VoicePreviewCardProps {
  languageCode: string;
  voiceId: string | null;
  mediaUrl: string | null;
  isGenerating: boolean;
  isActivePlayer: boolean;
  onRequestPreview: () => void;
  onPlayStart: () => void;
}

type PreviewState = 'idle' | 'generating' | 'has-media';

function deriveState(mediaUrl: string | null, isGenerating: boolean): PreviewState {
  if (isGenerating) return 'generating';
  if (mediaUrl) return 'has-media';
  return 'idle';
}

export function VoicePreviewCard({
  languageCode,
  voiceId,
  mediaUrl,
  isGenerating,
  isActivePlayer,
  onRequestPreview,
  onPlayStart,
}: VoicePreviewCardProps) {
  const previewText = PREVIEW_TEXTS[languageCode] ?? '';
  const state = deriveState(mediaUrl, isGenerating);
  log.debug('render', 'state derived', { languageCode, state });

  const canTrigger = !!voiceId && !isGenerating;

  const prevGeneratingRef = useRef(isGenerating);
  const [autoPlayKey, setAutoPlayKey] = useState(0);

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;
    if (wasGenerating && !isGenerating && mediaUrl) {
      log.info('generation:complete', 'auto-play preview', { languageCode });
      onPlayStart();
      setAutoPlayKey((k) => k + 1);
    }
  }, [isGenerating, mediaUrl, languageCode, onPlayStart]);

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Preview</p>
      {previewText ? (
        <p className="text-sm italic text-muted-foreground line-clamp-3">
          &ldquo;{previewText}&rdquo;
        </p>
      ) : null}

      <Button
        type="button"
        variant="default"
        disabled={!canTrigger}
        onClick={() => {
          log.info('preview', 'user requested preview', { languageCode, hasMedia: !!mediaUrl });
          onRequestPreview();
        }}
        className="gap-2"
      >
        {state === 'generating' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Preview</span>
          </>
        )}
      </Button>

      {state === 'has-media' && mediaUrl ? (
        <InlineAudioPlayer
          src={mediaUrl}
          isActive={isActivePlayer}
          onPlayStart={onPlayStart}
          autoPlayKey={autoPlayKey}
        />
      ) : null}
    </div>
  );
}
