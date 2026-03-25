// props-creative-space.tsx - Root container for props creative space
// Manages selected prop key and active content tab; delegates to sidebar + content area.

import { useState, useMemo, useCallback } from 'react';
import { PropsSidebar } from './props-sidebar';
import { PropsContentArea } from './props-content-area';
import { usePropKeys } from '@/stores/snapshot-store/selectors';
import { DEFAULT_CONTENT_TAB } from '@/constants/prop-constants';
import type { ContentTab } from '@/types/prop-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'PropsCreativeSpace');

export function PropsCreativeSpace() {
  const propKeys = usePropKeys();
  const [userSelectedPropKey, setUserSelectedPropKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ContentTab>(DEFAULT_CONTENT_TAB);

  // Derive effective prop: user choice if valid, else first available
  const selectedPropKey = useMemo(() => {
    if (userSelectedPropKey && propKeys.includes(userSelectedPropKey)) {
      return userSelectedPropKey;
    }
    const first = propKeys[0] ?? null;
    log.debug('selectedPropKey derived', 'auto-fallback', { first });
    return first;
  }, [propKeys, userSelectedPropKey]);

  const handlePropSelect = useCallback((key: string) => {
    log.info('handlePropSelect', 'prop selected', { key });
    setUserSelectedPropKey(key);
  }, []);

  const handleTabChange = useCallback((tab: ContentTab) => {
    log.debug('handleTabChange', 'tab changed', { tab });
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex h-full" role="main" aria-label="Props creative space">
      <PropsSidebar
        propKeys={propKeys}
        selectedPropKey={selectedPropKey}
        onPropSelect={handlePropSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedPropKey ? (
          <PropsContentArea
            selectedPropKey={selectedPropKey}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No prop selected</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PropsCreativeSpace;
