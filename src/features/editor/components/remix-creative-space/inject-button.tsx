// inject-button.tsx — 5-visual-state button reactive to inject job status.

import { CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import type { InjectJob } from '@/types/remix';

interface Props {
  job: InjectJob | null;
  onInject: () => void;
  onCancel?: () => void;
}

export function InjectButton({ job, onInject, onCancel }: Props) {
  const status = job?.status;

  if (status === 'pending') {
    return (
      <Button disabled className="w-full" size="sm">
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
        Queued…
      </Button>
    );
  }

  if (status === 'running') {
    return (
      <Button
        onClick={onCancel}
        className="relative w-full overflow-hidden"
        size="sm"
        variant="outline"
      >
        <span
          className="absolute inset-y-0 left-0 bg-primary/20"
          style={{ width: `${job?.progress ?? 0}%` }}
        />
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
        Injecting… {job?.progress ?? 0}%
      </Button>
    );
  }

  if (status === 'completed') {
    return (
      <Button
        onClick={onInject}
        variant="outline"
        size="sm"
        className={cn('w-full text-emerald-700')}
      >
        <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
        Done — Re-inject
      </Button>
    );
  }

  if (status === 'partial-error' || status === 'error') {
    return (
      <Button
        onClick={onInject}
        variant="outline"
        size="sm"
        className="w-full text-destructive"
      >
        <AlertTriangle className="mr-2 h-3.5 w-3.5" />
        {status === 'error' ? 'Failed — Retry' : 'Partial — Retry'}
      </Button>
    );
  }

  // idle / cancelled / undefined
  return (
    <Button onClick={onInject} size="sm" className="w-full">
      <Sparkles className="mr-2 h-3.5 w-3.5" />
      Inject
    </Button>
  );
}
