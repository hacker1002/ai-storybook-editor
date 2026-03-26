// stages-content-area.tsx - Tab bar (Settings / Sounds) + panel router + create dialogs

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
import { useStageByKey, useSnapshotActions } from '@/stores/snapshot-store/selectors';
import type { StageSetting } from '@/types/stage-types';
import { SettingsTabPanel } from './settings-tab-panel';
import { StageSoundsTabPanel } from './sounds-tab-panel';
import { createLogger } from '@/utils/logger';
import { cn, generateUniqueKey } from '@/utils/utils';

const log = createLogger('Editor', 'StagesContentArea');

export type StageContentTab = 'settings' | 'sounds';

const STAGE_CONTENT_TABS: { value: StageContentTab; label: string }[] = [
  { value: 'settings', label: 'Settings' },
  { value: 'sounds', label: 'Sounds' },
];

interface StagesContentAreaProps {
  selectedStageKey: string;
  activeTab: StageContentTab;
  onTabChange: (tab: StageContentTab) => void;
}

export function StagesContentArea({ selectedStageKey, activeTab, onTabChange }: StagesContentAreaProps) {
  const stage = useStageByKey(selectedStageKey);
  const { addStageSetting, addStageSound } = useSnapshotActions();

  // Create Setting modal
  const [isCreateSettingModalOpen, setIsCreateSettingModalOpen] = useState(false);
  const [newSettingName, setNewSettingName] = useState('');
  const [newSettingKey, setNewSettingKey] = useState('');

  // Create Sound modal
  const [isCreateSoundModalOpen, setIsCreateSoundModalOpen] = useState(false);
  const [newSoundName, setNewSoundName] = useState('');
  const [newSoundKey, setNewSoundKey] = useState('');

  const handleAddClick = () => {
    log.debug('handleAddClick', 'add click', { activeTab });
    if (activeTab === 'settings') {
      setNewSettingName('');
      setNewSettingKey('');
      setIsCreateSettingModalOpen(true);
    } else if (activeTab === 'sounds') {
      setNewSoundName('');
      setNewSoundKey('');
      setIsCreateSoundModalOpen(true);
    }
  };

  const handleCreateSetting = () => {
    const trimmedName = newSettingName.trim();
    if (!trimmedName || !newSettingKey) return;
    log.info('handleCreateSetting', 'create setting', { stageKey: selectedStageKey, name: trimmedName, key: newSettingKey });

    const newSetting: StageSetting = {
      name: trimmedName,
      key: newSettingKey,
      type: 1,
      visual_description: '',
      temporal: { era: '', season: '', weather: '', time_of_day: '' },
      sensory: { atmosphere: '', soundscape: '', lighting: '', color_palette: '' },
      emotional: { mood: '' },
      illustrations: [],
      image_references: [],
    };
    addStageSetting(selectedStageKey, newSetting);
    setIsCreateSettingModalOpen(false);
    setNewSettingName('');
    setNewSettingKey('');
  };

  const handleCreateSound = () => {
    if (!newSoundName.trim() || !newSoundKey.trim()) return;
    log.info('handleCreateSound', 'create sound', { stageKey: selectedStageKey, name: newSoundName, key: newSoundKey });
    addStageSound(selectedStageKey, {
      name: newSoundName.trim(),
      key: newSoundKey.trim(),
      description: '',
      media_url: '',
    });
    setIsCreateSoundModalOpen(false);
    setNewSoundName('');
    setNewSoundKey('');
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
          title={`Add ${activeTab === 'settings' ? 'setting' : 'sound'}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Panel */}
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
        {activeTab === 'settings' && stage && (
          <SettingsTabPanel key={selectedStageKey} stageKey={selectedStageKey} settings={stage.settings} />
        )}
        {activeTab === 'settings' && !stage && (
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

      {/* Create Setting Dialog */}
      <Dialog open={isCreateSettingModalOpen} onOpenChange={setIsCreateSettingModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Setting</DialogTitle>
            <DialogDescription>Add a new visual setting to this stage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                value={newSettingName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewSettingName(name);
                  setNewSettingKey(name.trim() ? generateUniqueKey(name.trim()) : '');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSetting(); }}
                placeholder="e.g. Rainy Night"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Key</label>
              <Input
                value={newSettingKey}
                readOnly
                className="bg-muted text-muted-foreground"
                placeholder="Auto-generated from name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSettingName(''); setNewSettingKey(''); setIsCreateSettingModalOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSetting}
              disabled={!newSettingName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Sound Dialog */}
      <Dialog open={isCreateSoundModalOpen} onOpenChange={setIsCreateSoundModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sound</DialogTitle>
            <DialogDescription>Add a new sound to this stage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                value={newSoundName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewSoundName(name);
                  setNewSoundKey(name.trim() ? generateUniqueKey(name.trim()) : '');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSound(); }}
                placeholder="e.g. Rain Ambience"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Key</label>
              <Input
                value={newSoundKey}
                readOnly
                className="bg-muted text-muted-foreground"
                placeholder="Auto-generated from name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSoundName(''); setNewSoundKey(''); setIsCreateSoundModalOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSound}
              disabled={!newSoundName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
