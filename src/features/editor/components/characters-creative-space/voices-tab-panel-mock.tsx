// voices-tab-panel-mock.tsx - Placeholder for Voices tab (not yet implemented)

import { Mic } from 'lucide-react';

export function VoicesTabPanelMock() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
      <Mic className="h-8 w-8 opacity-40" />
      <span className="text-sm">Voices panel coming soon</span>
    </div>
  );
}
