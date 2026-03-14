// animations-creative-space.tsx - Store-connected root component for animation editor
// TODO: Implement when RetouchSlice store is ready.
// This is the store-connected root. Demo uses AnimationEditorSidebar directly.

import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'AnimationsCreativeSpace');

export function AnimationsCreativeSpace() {
  log.info('AnimationsCreativeSpace', 'rendered (stub)');
  return (
    <div className="flex h-full">
      <aside className="w-[280px] border-r" />
      <div className="flex-1" />
    </div>
  );
}
