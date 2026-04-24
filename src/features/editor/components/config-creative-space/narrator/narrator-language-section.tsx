// narrator-language-section.tsx
// Per-language composition: Voice picker + preview card + optional error banner.
// Purely presentational — parent owns all state and mutations.

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { NarratorLanguageEntry } from '@/types/editor';

import { VoiceSelector } from './voice-selector';
import { VoicePreviewCard } from './voice-preview-card';

const log = createLogger('Editor', 'NarratorLanguageSection');

export interface NarratorLanguageSectionProps {
  langCode: string;
  langLabel: string;
  entry: NarratorLanguageEntry | null;
  isGenerating: boolean;
  isActivePlayer: boolean;
  error: string | null;
  onVoiceChange: (voiceId: string) => void;
  onRequestPreview: () => void;
  onPlayStart: () => void;
  onDismissError: () => void;
  className?: string;
}

export function NarratorLanguageSection({
  langCode,
  langLabel,
  entry,
  isGenerating,
  isActivePlayer,
  error,
  onVoiceChange,
  onRequestPreview,
  onPlayStart,
  onDismissError,
  className,
}: NarratorLanguageSectionProps) {
  log.debug('render', 'section', {
    langCode,
    hasVoice: Boolean(entry?.voice_id),
    hasMedia: Boolean(entry?.media_url),
    isGenerating,
    isActivePlayer,
    hasError: Boolean(error),
  });

  return (
    <section
      className={cn('flex flex-col gap-3 border-b pb-5 last:border-b-0', className)}
      aria-label={`Narrator settings for ${langLabel}`}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider">{langLabel}</h3>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Voice
        </p>
        <VoiceSelector
          languageCode={langCode}
          value={entry?.voice_id ?? null}
          onChange={onVoiceChange}
          disabled={isGenerating}
        />
      </div>

      <VoicePreviewCard
        languageCode={langCode}
        voiceId={entry?.voice_id ?? null}
        mediaUrl={entry?.media_url ?? null}
        isGenerating={isGenerating}
        isActivePlayer={isActivePlayer}
        onRequestPreview={onRequestPreview}
        onPlayStart={onPlayStart}
      />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="flex-1 leading-relaxed">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive"
            onClick={() => {
              log.info('error dismissed', 'user clicked X', { langCode });
              onDismissError();
            }}
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
