// stages-content-area.tsx - Tab bar (Variants / Sounds) + panel router + create dialogs

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useStageByKey, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import { VariantsTabPanel } from './variants-tab-panel';
import { StageSoundsTabPanel } from './sounds-tab-panel';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { CreateAssetDialog } from '@/features/editor/components/shared-components/create-asset-dialog';

const log = createLogger('Editor', 'StagesContentArea');

export type StageContentTab = 'variants' | 'sounds';

const STAGE_CONTENT_TABS: { value: StageContentTab; label: string }[] = [
  { value: 'variants', label: 'Variants' },
  { value: 'sounds', label: 'Sounds' },
];

interface StagesContentAreaProps {
  selectedStageKey: string;
  activeTab: StageContentTab;
  onTabChange: (tab: StageContentTab) => void;
}

export function StagesContentArea({ selectedStageKey, activeTab, onTabChange }: StagesContentAreaProps) {
  const stage = useStageByKey(selectedStageKey);
  const { addStageVariant, addStageSound } = useSnapshotActions();

  const [isCreateVariantModalOpen, setIsCreateVariantModalOpen] = useState(false);
  const [isCreateSoundModalOpen, setIsCreateSoundModalOpen] = useState(false);

  const handleAddClick = () => {
    log.debug('handleAddClick', 'add click', { activeTab });
    if (activeTab === 'variants') {
      setIsCreateVariantModalOpen(true);
    } else if (activeTab === 'sounds') {
      setIsCreateSoundModalOpen(true);
    }
  };

  const handleConfirmCreateVariant = (name: string, key: string) => {
    log.info('handleConfirmCreateVariant', 'creating variant', { stageKey: selectedStageKey, key });
    addStageVariant(selectedStageKey, {
      name,
      key,
      type: 1,
      visual_description: '',
      temporal: { era: '', season: '', weather: '', time_of_day: '' },
      sensory: { atmosphere: '', soundscape: '', lighting: '', color_palette: '' },
      emotional: { mood: '' },
      illustrations: [],
      image_references: [],
    });
  };

  const handleConfirmCreateSound = (name: string, key: string) => {
    log.info('handleConfirmCreateSound', 'creating sound', { stageKey: selectedStageKey, key });
    addStageSound(selectedStageKey, {
      name,
      key,
      description: '',
      media_url: '',
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" role="region" aria-label="Stage content">
      {/* Tab Bar */}
      <div
        className="flex items-center h-11 border-b shrink-0 px-2"
        role="tablist"
        aria-orientation="horizontal"
      >
        {STAGE_CONTENT_TABS.map((tab) => (
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
          title={`Add ${activeTab === 'variants' ? 'variant' : 'sound'}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Panel */}
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
        {activeTab === 'variants' && stage && (
          <VariantsTabPanel key={selectedStageKey} stageKey={selectedStageKey} variants={stage.variants} />
        )}
        {activeTab === 'variants' && !stage && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Stage not found.
          </div>
        )}
        {activeTab === 'sounds' && stage && (
          <StageSoundsTabPanel key={selectedStageKey} stageKey={selectedStageKey} sounds={stage.sounds} />
        )}
        {activeTab === 'sounds' && !stage && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Stage not found.
          </div>
        )}
      </div>

      <CreateAssetDialog
        open={isCreateVariantModalOpen}
        onOpenChange={setIsCreateVariantModalOpen}
        title="Create Stage Variant"
        description="Add a new visual variant to this stage."
        namePlaceholder="e.g. Rainy Night"
        existingKeys={stage?.variants.map((v) => v.key) ?? []}
        onCreate={handleConfirmCreateVariant}
      />

      <CreateAssetDialog
        open={isCreateSoundModalOpen}
        onOpenChange={setIsCreateSoundModalOpen}
        title="Create Stage Sound"
        description="Add a new sound to this stage."
        namePlaceholder="e.g. Rain Ambience"
        existingKeys={stage?.sounds.map((s) => s.key) ?? []}
        onCreate={handleConfirmCreateSound}
      />
    </div>
  );
}
