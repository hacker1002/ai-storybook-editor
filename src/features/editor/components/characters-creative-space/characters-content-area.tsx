// characters-content-area.tsx - Tab bar (Variants / Voices / Crops) + panel router + create variant dialog

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCharacterByKey, useSnapshotActions } from '@/stores/snapshot-store';
import { VariantsTabPanel } from './variants-tab-panel';
import { VoiceSettingTabPanel } from './voice-setting';
import { CropsTabPanelMock } from './crops-tab-panel-mock';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { CreateAssetDialog } from '@/features/editor/components/shared-components/create-asset-dialog';

const log = createLogger('Editor', 'CharactersContentArea');

export type CharacterContentTab = 'variants' | 'voices' | 'crops';

const CHARACTER_CONTENT_TABS = [
  { value: 'variants' as const, label: 'Variants' },
  { value: 'voices' as const, label: 'Voice Setting' },
  { value: 'crops' as const, label: 'Crops' },
];

interface CharactersContentAreaProps {
  selectedCharacterKey: string;
  activeTab: CharacterContentTab;
  onTabChange: (tab: CharacterContentTab) => void;
}

export function CharactersContentArea({
  selectedCharacterKey,
  activeTab,
  onTabChange,
}: CharactersContentAreaProps) {
  const character = useCharacterByKey(selectedCharacterKey);
  const { addCharacterVariant } = useSnapshotActions();

  const [isCreateVariantModalOpen, setIsCreateVariantModalOpen] = useState(false);

  const handleAddClick = () => {
    log.debug('handleAddClick', 'add click', { activeTab });
    if (activeTab === 'variants') {
      setIsCreateVariantModalOpen(true);
    }
    // voices and crops: TBD
  };

  const handleConfirmCreateVariant = (name: string, key: string) => {
    log.info('handleConfirmCreateVariant', 'creating variant', { characterKey: selectedCharacterKey, key });
    addCharacterVariant(selectedCharacterKey, {
      name,
      key,
      type: 1,
      appearance: { height: 0, hair: '', eyes: '', face: '', build: '' },
      visual_description: '',
      illustrations: [],
      image_references: [],
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" role="region" aria-label="Character content">
      {/* Tab Bar */}
      <div
        className="flex items-center h-11 border-b shrink-0 px-2"
        role="tablist"
        aria-orientation="horizontal"
      >
        {CHARACTER_CONTENT_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={activeTab === tab.value}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              log.debug('tab click', 'switch tab', { tab: tab.value });
              onTabChange(tab.value);
            }}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleAddClick}
          disabled={activeTab !== 'variants'}
          title={activeTab === 'variants' ? 'Add variant' : undefined}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Panel */}
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
        {activeTab === 'variants' && character && (
          <VariantsTabPanel
            key={selectedCharacterKey}
            characterKey={selectedCharacterKey}
            variants={character.variants}
          />
        )}
        {activeTab === 'variants' && !character && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Character not found.
          </div>
        )}
        {activeTab === 'voices' && character && (
          <VoiceSettingTabPanel
            key={selectedCharacterKey}
            characterKey={selectedCharacterKey}
            voiceSetting={character.voice_setting}
          />
        )}
        {activeTab === 'voices' && !character && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Character not found.
          </div>
        )}
        {activeTab === 'crops' && <CropsTabPanelMock />}
      </div>

      <CreateAssetDialog
        open={isCreateVariantModalOpen}
        onOpenChange={setIsCreateVariantModalOpen}
        title="Create Character Variant"
        description="Add a new variant to this character."
        namePlaceholder="e.g. Battle Mode"
        existingKeys={character?.variants.map((v) => v.key) ?? []}
        onCreate={handleConfirmCreateVariant}
      />
    </div>
  );
}
