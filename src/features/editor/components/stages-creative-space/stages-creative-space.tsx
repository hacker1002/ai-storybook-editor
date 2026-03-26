// stages-creative-space.tsx - Root container for stages creative space
// Manages selected stage key and active content tab; delegates to sidebar + content area.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { StagesSidebar } from './stages-sidebar';
import { StagesContentArea } from './stages-content-area';
import { useStageKeys } from '@/stores/snapshot-store/selectors';
import { useLocationActions } from '@/stores/location-store';
import { createLogger } from '@/utils/logger';
import type { StageContentTab } from './stages-content-area';

const log = createLogger('Editor', 'StagesCreativeSpace');

export function StagesCreativeSpace() {
  const stageKeys = useStageKeys();
  const { fetchLocations } = useLocationActions();
  const [userSelectedStageKey, setUserSelectedStageKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StageContentTab>('settings');

  // Fetch locations on mount
  useEffect(() => {
    log.info('StagesCreativeSpace', 'mount — fetching locations');
    fetchLocations();
  }, [fetchLocations]);

  // Derive effective stage: user choice if valid, else first available
  const selectedStageKey = useMemo(() => {
    if (userSelectedStageKey && stageKeys.includes(userSelectedStageKey)) {
      return userSelectedStageKey;
    }
    const first = stageKeys[0] ?? null;
    log.debug('selectedStageKey derived', 'auto-fallback', { first });
    return first;
  }, [stageKeys, userSelectedStageKey]);

  const handleStageSelect = useCallback((key: string) => {
    log.info('handleStageSelect', 'stage selected', { key });
    setUserSelectedStageKey(key);
  }, []);

  const handleTabChange = useCallback((tab: StageContentTab) => {
    log.debug('handleTabChange', 'tab changed', { tab });
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex h-full" role="main" aria-label="Stages creative space">
      <StagesSidebar
        stageKeys={stageKeys}
        selectedStageKey={selectedStageKey}
        onStageSelect={handleStageSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedStageKey ? (
          <StagesContentArea
            selectedStageKey={selectedStageKey}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a stage</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StagesCreativeSpace;
