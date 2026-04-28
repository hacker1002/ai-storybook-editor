// combined-player-row.tsx — Top-of-modal row showing the combined audio
// player + label + Refresh button. Shown only when `combined_audio_url`
// is non-null (otherwise the modal renders <CombinedFallback /> instead).

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
  onRefresh: () => void;
}

export function CombinedPlayerRow({
  audioUrl,
  chunkCount,
  isMerging,
  refreshDisabled,
  onRefresh,
}: CombinedPlayerRowProps) {
  const activePlayerId = useActivePlayerId();
  const isActive = activePlayerId === PLAYER_ID;

  const handlePlayStart = () => {
    getPlaybackBusActions().requestPlay(PLAYER_ID);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Combined ({chunkCount} narration{chunkCount === 1 ? '' : 's'})</span>
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
        key={audioUrl}
        src={audioUrl}
        isActive={isActive}
        onPlayStart={handlePlayStart}
        className="border-0 bg-transparent px-0 py-0"
      />
    </div>
  );
}
