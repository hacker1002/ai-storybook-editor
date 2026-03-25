// crops-tab-panel-mock.tsx - Placeholder for Crops tab (not yet implemented)

import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'CropsTabPanelMock');

export function CropsTabPanelMock() {
  log.debug('render', 'crops mock panel');
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Crops tab — coming soon
    </div>
  );
}
