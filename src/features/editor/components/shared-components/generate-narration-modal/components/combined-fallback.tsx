// combined-fallback.tsx — Placeholder shown in place of the combined player
// when there is no `combined_audio_url`. Drives 4 distinct messages + button
// state per spec §3.1: not-ready / ready-to-build / merging / error.

import { Loader2, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { combineErrorMessageFor } from '../helpers/combine-error-messages';
import type { CombineAudioChunksErrorCode } from '@/apis/combine-audio-chunks-api';

export interface CombinedFallbackProps {
  canCombine: boolean;
  isMerging: boolean;
  /** Error code from combine API or the FE-only `'CHUNKS_NOT_READY'`. */
  error: string | null;
  onRefresh: () => void;
}

const FE_ONLY_CHUNKS_NOT_READY = 'CHUNKS_NOT_READY';

function copyFor(props: CombinedFallbackProps): string {
  const { canCombine, isMerging, error } = props;
  if (isMerging) return 'Đang ghép audio các chunk…';
  if (error) {
    if (error === FE_ONLY_CHUNKS_NOT_READY) {
      return 'Một số chunk chưa có bản được chọn. Hãy chọn lại bản kết quả cho chunk đó.';
    }
    // Map known API codes; fallback for anything else.
    return combineErrorMessageFor({
      errorCode: error as CombineAudioChunksErrorCode,
    });
  }
  if (canCombine) return 'Click Combine để build combined audio (≈1-3s).';
  return 'Generate đủ các chunk rồi click Combine để ghép.';
}

export function CombinedFallback(props: CombinedFallbackProps) {
  const { canCombine, isMerging, error, onRefresh } = props;
  const message = copyFor(props);
  const buttonDisabled = isMerging || (!canCombine && !error);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-12 items-center gap-3 rounded-md border border-dashed bg-muted/30 px-3 text-sm',
        error && 'border-destructive/40 text-destructive',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        disabled={buttonDisabled}
        onClick={onRefresh}
        aria-label={error ? 'Retry combining audio' : 'Build combined audio'}
        aria-busy={isMerging}
      >
        {isMerging ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCcw className="h-3.5 w-3.5" />
        )}
        {error ? 'Retry' : 'Combine'}
      </Button>
    </div>
  );
}
