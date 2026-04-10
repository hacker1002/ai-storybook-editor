// props-content-area.tsx - Tab bar (Variants / Sounds / Crops) + panel router + create dialogs

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { usePropByKey, useSnapshotActions } from '@/stores/snapshot-store';
import type { ContentTab } from '@/types/prop-types';
import { CONTENT_TABS } from '@/constants/prop-constants';
import { VariantsTabPanel } from './variants-tab-panel';
import { SoundsTabPanel } from './sounds-tab-panel';
import { CropsTabPanelMock } from './crops-tab-panel-mock';
import { createLogger } from '@/utils/logger';
import { cn } from '@/utils/utils';
import { CreateAssetDialog } from '@/features/editor/components/shared-components/create-asset-dialog';

const log = createLogger('Editor', 'PropsContentArea');

interface PropsContentAreaProps {
  selectedPropKey: string;
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

export function PropsContentArea({ selectedPropKey, activeTab, onTabChange }: PropsContentAreaProps) {
  const prop = usePropByKey(selectedPropKey);
  const { addPropVariant, addPropSound } = useSnapshotActions();

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
    log.info('handleConfirmCreateVariant', 'creating variant', { propKey: selectedPropKey, key });
    addPropVariant(selectedPropKey, {
      name,
      key,
      type: 1,
      visual_description: '',
      illustrations: [],
      image_references: [],
    });
  };

  const handleConfirmCreateSound = (name: string, key: string) => {
    log.info('handleConfirmCreateSound', 'creating sound', { propKey: selectedPropKey, key });
    addPropSound(selectedPropKey, {
      name,
      key,
      description: '',
      media_url: '',
    });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden" role="region" aria-label="Prop content">
      {/* Tab Bar */}
      <div
        className="flex items-center h-11 border-b shrink-0 px-2"
        role="tablist"
        aria-orientation="horizontal"
      >
        {CONTENT_TABS.map((tab) => (
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
          title={`Add ${activeTab === 'variants' ? 'variant' : activeTab === 'sounds' ? 'sound' : 'item'}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Panel */}
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
        {activeTab === 'variants' && prop && (
          <VariantsTabPanel key={selectedPropKey} propKey={selectedPropKey} variants={prop.variants} />
        )}
        {activeTab === 'variants' && !prop && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Prop not found.
          </div>
        )}
        {activeTab === 'sounds' && prop && (
          <SoundsTabPanel key={selectedPropKey} propKey={selectedPropKey} sounds={prop.sounds} />
        )}
        {activeTab === 'sounds' && !prop && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Prop not found.
          </div>
        )}
        {activeTab === 'crops' && <CropsTabPanelMock />}
      </div>

      <CreateAssetDialog
        open={isCreateVariantModalOpen}
        onOpenChange={setIsCreateVariantModalOpen}
        title="Create Prop Variant"
        description="Add a new visual variant to this prop."
        namePlaceholder="e.g. Glowing"
        existingKeys={prop?.variants.map((v) => v.key) ?? []}
        onCreate={handleConfirmCreateVariant}
      />

      <CreateAssetDialog
        open={isCreateSoundModalOpen}
        onOpenChange={setIsCreateSoundModalOpen}
        title="Create Prop Sound"
        description="Add a new sound to this prop."
        namePlaceholder="e.g. Swing Sound"
        existingKeys={prop?.sounds.map((s) => s.key) ?? []}
        onCreate={handleConfirmCreateSound}
      />
    </div>
  );
}
