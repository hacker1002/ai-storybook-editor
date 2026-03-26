// characters-content-area.tsx - Tab bar (Variants / Voices / Crops) + panel router + create variant dialog

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useCharacterByKey, useSnapshotActions } from '@/stores/snapshot-store';
import { VariantsTabPanel } from './variants-tab-panel';
import { VoicesTabPanelMock } from './voices-tab-panel-mock';
import { CropsTabPanelMock } from './crops-tab-panel-mock';
import { createLogger } from '@/utils/logger';
import { cn, generateUniqueKey } from '@/utils/utils';

const log = createLogger('Editor', 'CharactersContentArea');

export type CharacterContentTab = 'variants' | 'voices' | 'crops';

const CHARACTER_CONTENT_TABS = [
  { value: 'variants' as const, label: 'Variants' },
  { value: 'voices' as const, label: 'Voices' },
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

  // Create Variant modal state
  const [isCreateVariantModalOpen, setIsCreateVariantModalOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantKey, setNewVariantKey] = useState('');

  const handleAddClick = () => {
    log.debug('handleAddClick', 'add click', { activeTab });
    if (activeTab === 'variants') {
      setNewVariantName('');
      setNewVariantKey('');
      setIsCreateVariantModalOpen(true);
    }
    // voices and crops: TBD
  };

  const handleCreateVariant = () => {
    const trimmedName = newVariantName.trim();
    if (!trimmedName || !newVariantKey) return;
    log.info('handleCreateVariant', 'create variant', {
      characterKey: selectedCharacterKey,
      name: trimmedName,
      key: newVariantKey,
    });
    addCharacterVariant(selectedCharacterKey, {
      name: trimmedName,
      key: newVariantKey,
      type: 1,
      appearance: { height: 0, hair: '', eyes: '', face: '', build: '' },
      visual_description: '',
      illustrations: [],
      image_references: [],
    });
    setIsCreateVariantModalOpen(false);
    setNewVariantName('');
    setNewVariantKey('');
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
        {activeTab === 'voices' && <VoicesTabPanelMock />}
        {activeTab === 'crops' && <CropsTabPanelMock />}
      </div>

      {/* Create Variant Dialog */}
      <Dialog open={isCreateVariantModalOpen} onOpenChange={setIsCreateVariantModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Character Variant</DialogTitle>
            <DialogDescription>Add a new variant to this character.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                value={newVariantName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewVariantName(name);
                  setNewVariantKey(name.trim() ? generateUniqueKey(name.trim()) : '');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateVariant(); }}
                placeholder="e.g. Battle Mode"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Key</label>
              <Input
                value={newVariantKey}
                readOnly
                className="bg-muted text-muted-foreground"
                placeholder="Auto-generated from name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewVariantName('');
                setNewVariantKey('');
                setIsCreateVariantModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateVariant} disabled={!newVariantName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
