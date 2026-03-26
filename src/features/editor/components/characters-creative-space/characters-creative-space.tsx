// characters-creative-space.tsx - Root container for characters creative space
// Manages selected character key and active content tab; delegates to sidebar + content area.

import { useState, useMemo, useCallback } from 'react';
import { CharactersSidebar } from './characters-sidebar';
import { CharactersContentArea, type CharacterContentTab } from './characters-content-area';
import { useCharacterKeys } from '@/stores/snapshot-store/selectors';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'CharactersCreativeSpace');

const DEFAULT_CHARACTER_TAB: CharacterContentTab = 'variants';

export function CharactersCreativeSpace() {
  const characterKeys = useCharacterKeys();
  const [userSelectedCharacterKey, setUserSelectedCharacterKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CharacterContentTab>(DEFAULT_CHARACTER_TAB);

  // Derive effective character: user choice if valid, else first available
  const selectedCharacterKey = useMemo(() => {
    if (userSelectedCharacterKey && characterKeys.includes(userSelectedCharacterKey)) {
      return userSelectedCharacterKey;
    }
    const first = characterKeys[0] ?? null;
    log.debug('selectedCharacterKey derived', 'auto-fallback', { first });
    return first;
  }, [characterKeys, userSelectedCharacterKey]);

  const handleCharacterSelect = useCallback((key: string) => {
    log.info('handleCharacterSelect', 'character selected', { key });
    setUserSelectedCharacterKey(key);
  }, []);

  const handleTabChange = useCallback((tab: CharacterContentTab) => {
    log.debug('handleTabChange', 'tab changed', { tab });
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex h-full" role="main" aria-label="Characters creative space">
      <CharactersSidebar
        characterKeys={characterKeys}
        selectedCharacterKey={selectedCharacterKey}
        onCharacterSelect={handleCharacterSelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedCharacterKey ? (
          <CharactersContentArea
            selectedCharacterKey={selectedCharacterKey}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No character selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
