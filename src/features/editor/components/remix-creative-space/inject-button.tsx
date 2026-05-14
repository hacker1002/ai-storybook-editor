// inject-button.tsx — Disabled placeholder. Phase 1 (text swap) runs synchronously
// at createRemix; Phase 2 (audio regen) + Phase 3 (image inject) backend not
// shipped — button re-enabled when Phase 3 lands.

import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InjectJob } from '@/types/remix';

interface Props {
  job: InjectJob | null;
  onInject: () => void;
  onCancel?: () => void;
}

export function InjectButton(_props: Props) {
  void _props;
  return (
    <Button
      disabled
      size="sm"
      variant="secondary"
      className="w-full"
      title="Image swap coming soon (Phase 3)"
    >
      <Repeat className="mr-2 h-3.5 w-3.5" />
      Inject
    </Button>
  );
}
