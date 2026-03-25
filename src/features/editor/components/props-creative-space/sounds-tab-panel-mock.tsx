// sounds-tab-panel-mock.tsx - Placeholder for Sounds tab (not yet implemented)

import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SoundsTabPanelMock');

export function SoundsTabPanelMock() {
  log.debug('render', 'sounds mock panel');
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Sounds tab — coming soon
    </div>
  );
}
