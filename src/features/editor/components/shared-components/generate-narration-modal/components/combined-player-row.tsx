// combined-player-row.tsx — Top-of-modal row showing the combined audio
// player + label + Refresh button. Shown only when `combined_audio_url`
// is non-null (otherwise the modal renders <CombinedFallback /> instead).

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InlineAudioPlayer } from '@/features/voices/components/voice-preview/inline-audio-player';
import {
  useActivePlayerId,
  getPlaybackBusActions,
} from '../audio-playback-bus';

const PLAYER_ID = 'combined';

export interface CombinedPlayerRowProps {
  audioUrl: string;
  chunkCount: number;
  isMerging: boolean;
  /** Disables the refresh button (e.g. !canCombine). */
  refreshDisabled: boolean;
  /**
   * True when the cached combined audio diverges from current chunk state
   * (script/voice/param edit, or selection changed since last Combine).
   * Renders a Stale pill next to the title.
   */
  isStale: boolean;
  /** Bumped after a successful Combine — triggers autoplay on the inline player. */
  autoPlayToken: number;
  onRefresh: () => void;
}

export function CombinedPlayerRow({
  audioUrl,
  chunkCount,
  isMerging,
  refreshDisabled,
  isStale,
  autoPlayToken,
  onRefresh,
}: CombinedPlayerRowProps) {
  const activePlayerId = useActivePlayerId();
  const isActive = activePlayerId === PLAYER_ID;

  const handlePlayStart = () => {
    getPlaybackBusActions().requestPlay(PLAYER_ID);
  };

  // Mirror chunk-card pattern: parent token → local autoPlayKey + bus claim.
  // InlineAudioPlayer is NOT keyed by audioUrl (its [src] effect already
  // recreates the underlying Audio); avoiding the remount lets the autoPlay
  // effect see a stable component lifecycle and play() lands cleanly.
  const lastTokenRef = useRef<number>(autoPlayToken);
  const [autoPlayKey, setAutoPlayKey] = useState(0);
  useEffect(() => {
    if (autoPlayToken === lastTokenRef.current) return;
    lastTokenRef.current = autoPlayToken;
    setAutoPlayKey((k) => k + 1);
    getPlaybackBusActions().requestPlay(PLAYER_ID);
  }, [autoPlayToken]);

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Combined ({chunkCount} narration{chunkCount === 1 ? '' : 's'})</span>
          {isStale && (
            <span
              className="text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              title="Combined audio out of sync with current chunks — click Combine to refresh"
            >
              Out of sync
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2"
          disabled={refreshDisabled || isMerging}
          onClick={onRefresh}
          aria-label="Rebuild combined audio"
          aria-busy={isMerging}
        >
          {isMerging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Combine
        </Button>
      </div>

      <InlineAudioPlayer
        src={audioUrl}
        isActive={isActive}
        autoPlayKey={autoPlayKey}
        onPlayStart={handlePlayStart}
        className="border-0 bg-transparent px-0 py-0"
      />
    </div>
  );
}
