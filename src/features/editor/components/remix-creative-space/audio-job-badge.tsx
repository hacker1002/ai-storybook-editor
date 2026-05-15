// audio-job-badge.tsx — Dumb presentational badge for the audio swap job
// status. Consumes AudioJobBadgeState discriminated union; renders one of 6
// visible variants or null. Optimistic merge logic lives in the store; this
// component never touches state directly. a11y: role=status + aria-live polite.
// Spec: ai-storybook-design/component/editor-page/remix-creative-space/01-remix-sidebar.md §3.5

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AudioLines,
  Ban,
  Loader2,
  RotateCcw,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { AudioJobBadgeState } from '@/types/remix';

const log = createLogger('Editor', 'AudioJobBadge');

const RETRY_DEBOUNCE_MS = 1000;

interface AudioJobBadgeProps {
  state: AudioJobBadgeState;
  remixName: string;
  onRetry: () => Promise<void>;
  onCancel: (jobId: string) => Promise<void>;
  onDismiss?: (jobId: string) => void;
}

type VisibleKind = Exclude<AudioJobBadgeState['kind'], 'hidden'>;

const TINT_BY_KIND: Record<VisibleKind, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-muted text-muted-foreground',
  cancelling: 'bg-muted text-muted-foreground opacity-70',
  cancelled: 'bg-muted text-muted-foreground',
  partial: 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  failed: 'bg-destructive/10 text-destructive',
};

const ICON_BY_KIND: Record<VisibleKind, LucideIcon> = {
  queued: Loader2,
  running: AudioLines,
  cancelling: Loader2,
  cancelled: Ban,
  partial: AlertTriangle,
  failed: XCircle,
};

const SPIN_KINDS = new Set<VisibleKind>(['queued', 'cancelling']);

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '…';
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function computeBadgeText(state: Exclude<AudioJobBadgeState, { kind: 'hidden' }>): string {
  switch (state.kind) {
    case 'queued':
      return 'Audio · queued';
    case 'running':
      return `Audio · ${state.current}/${state.total} spreads`;
    case 'cancelling':
      return 'Audio · cancelling…';
    case 'cancelled':
      return `Audio · cancelled · ${relativeTime(state.completedAt)}`;
    case 'partial':
      return `Audio · ${state.errorCount} chunks failed`;
    case 'failed':
      return `Audio failed: ${truncate(state.message, 40)}`;
  }
}

export function AudioJobBadge({
  state,
  remixName,
  onRetry,
  onCancel,
  onDismiss,
}: AudioJobBadgeProps) {
  const [retryBusy, setRetryBusy] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending retry-debounce timer on unmount to avoid setState on unmounted.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  if (state.kind === 'hidden') {
    return null;
  }

  const handleRetry = async () => {
    if (retryBusy) return;
    setRetryBusy(true);
    log.info('handleRetry', 'click', { remixName });
    try {
      await onRetry();
    } catch (err) {
      log.error('handleRetry', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // 1s UI dedupe — backend dedup is authoritative; this only blocks rapid spam clicks.
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        setRetryBusy(false);
      }, RETRY_DEBOUNCE_MS);
    }
  };

  const handleCancel = async () => {
    if (state.kind !== 'queued' && state.kind !== 'running') return;
    log.info('handleCancel', 'click', { remixName, jobId: state.jobId });
    try {
      await onCancel(state.jobId);
    } catch (err) {
      log.error('handleCancel', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDismiss = () => {
    if (!onDismiss) return;
    if (state.kind === 'cancelling') return; // no jobId to dismiss until terminal
    log.info('handleDismiss', 'click', { remixName, jobId: state.jobId });
    onDismiss(state.jobId);
  };

  const Icon = ICON_BY_KIND[state.kind];
  const text = computeBadgeText(state);
  const showRetry =
    state.kind === 'cancelled' ||
    state.kind === 'partial' ||
    state.kind === 'failed';
  const showCancel = state.kind === 'queued' || state.kind === 'running';
  const showDismiss =
    !!onDismiss && (state.kind === 'cancelled' || state.kind === 'failed');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex items-center gap-2 h-9 px-2 rounded-md text-xs',
        TINT_BY_KIND[state.kind],
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          SPIN_KINDS.has(state.kind) && 'animate-spin',
        )}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{text}</span>

      {showRetry && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleRetry}
          disabled={retryBusy}
          aria-label={`Retry audio generation for ${remixName}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}

      {showCancel && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCancel}
          aria-label={`Cancel audio generation for ${remixName}`}
        >
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      )}

      {showDismiss && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-60"
          onClick={handleDismiss}
          aria-label={`Dismiss audio status for ${remixName}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
