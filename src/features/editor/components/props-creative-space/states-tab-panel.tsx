// states-tab-panel.tsx - Lists all prop states as collapsible accordion items

import { useState } from 'react';
import type { PropState } from '@/types/prop-types';
import { StateItem } from './state-item';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'StatesTabPanel');

interface StatesTabPanelProps {
  propKey: string;
  states: PropState[];
}

// NOTE: Parent must render with key={propKey} so this component remounts on prop change,
// resetting expandedStateKey to the first state automatically.
export function StatesTabPanel({ propKey, states }: StatesTabPanelProps) {
  const firstKey = states.length > 0 ? states[0].key : null;
  log.debug('mount/render', 'init', { propKey, firstKey });
  const [expandedStateKey, setExpandedStateKey] = useState<string | null>(firstKey);

  const handleToggle = (stateKey: string) => {
    setExpandedStateKey((prev) => {
      const next = prev === stateKey ? null : stateKey;
      log.debug('handleToggle', 'toggle state', { stateKey, next });
      return next;
    });
  };

  if (states.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No states yet. Click + to add one.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {states.map((st) => (
        <StateItem
          key={st.key}
          propKey={propKey}
          stateData={st}
          isExpanded={expandedStateKey === st.key}
          onToggle={() => handleToggle(st.key)}
        />
      ))}
    </div>
  );
}
