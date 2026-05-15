// inject-button.tsx — Disabled placeholder. Phase 1 (text swap) runs synchronously
// at createRemix; Phase 2 (audio regen) ships as auto-trigger via the new
// AudioJobBadge; Phase 3 (image inject) backend not shipped — button re-enabled
// when Phase 3 lands. Component is intentionally prop-less to discourage
// callers from wiring legacy state to it.

import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function InjectButton() {
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
