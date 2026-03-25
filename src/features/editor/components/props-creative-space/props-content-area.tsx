// props-content-area.tsx - Tab bar (States / Sounds / Crops) + panel router + create dialogs

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
import { usePropByKey, useSnapshotActions } from '@/stores/snapshot-store';
import type { ContentTab } from '@/types/prop-types';
import { CONTENT_TABS } from '@/constants/prop-constants';
import { StatesTabPanel } from './states-tab-panel';
import { SoundsTabPanel } from './sounds-tab-panel';
import { CropsTabPanelMock } from './crops-tab-panel-mock';
import { createLogger } from '@/utils/logger';
import { cn, generateUniqueKey } from '@/utils/utils';

const log = createLogger('Editor', 'PropsContentArea');

interface PropsContentAreaProps {
  selectedPropKey: string;
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

export function PropsContentArea({ selectedPropKey, activeTab, onTabChange }: PropsContentAreaProps) {
  const prop = usePropByKey(selectedPropKey);
  const { addPropState, addPropSound } = useSnapshotActions();

  // Create State modal
  const [isCreateStateModalOpen, setIsCreateStateModalOpen] = useState(false);
  const [newStateName, setNewStateName] = useState('');
  const [newStateKey, setNewStateKey] = useState('');

  // Create Sound modal
  const [isCreateSoundModalOpen, setIsCreateSoundModalOpen] = useState(false);
  const [newSoundName, setNewSoundName] = useState('');
  const [newSoundKey, setNewSoundKey] = useState('');

  const handleAddClick = () => {
    log.debug('handleAddClick', 'add click', { activeTab });
    if (activeTab === 'states') {
      setNewStateName('');
      setNewStateKey('');
      setIsCreateStateModalOpen(true);
    } else if (activeTab === 'sounds') {
      setNewSoundName('');
      setNewSoundKey('');
      setIsCreateSoundModalOpen(true);
    }
  };

  const handleCreateState = () => {
    if (!newStateName.trim() || !newStateKey) return;
    log.info('handleCreateState', 'create state', { propKey: selectedPropKey, name: newStateName, key: newStateKey });
    addPropState(selectedPropKey, {
      name: newStateName.trim(),
      key: newStateKey,
      type: 1,
      visual_description: '',
      illustrations: [],
      image_references: [],
    });
    setIsCreateStateModalOpen(false);
    setNewStateName('');
    setNewStateKey('');
  };

  const handleCreateSound = () => {
    if (!newSoundName.trim() || !newSoundKey.trim()) return;
    log.info('handleCreateSound', 'create sound', { propKey: selectedPropKey, name: newSoundName, key: newSoundKey });
    addPropSound(selectedPropKey, {
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
          title={`Add ${activeTab === 'states' ? 'state' : activeTab === 'sounds' ? 'sound' : 'item'}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab Panel */}
      <div className="flex-1 min-h-0 overflow-auto" role="tabpanel">
        {activeTab === 'states' && prop && (
          <StatesTabPanel key={selectedPropKey} propKey={selectedPropKey} states={prop.states} />
        )}
        {activeTab === 'states' && !prop && (
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

      {/* Create State Dialog */}
      <Dialog open={isCreateStateModalOpen} onOpenChange={setIsCreateStateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New State</DialogTitle>
            <DialogDescription>Add a new visual state to this prop.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                value={newStateName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewStateName(name);
                  setNewStateKey(name.trim() ? generateUniqueKey(name.trim()) : '');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateState(); }}
                placeholder="e.g. Glowing"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Key</label>
              <Input
                value={newStateKey}
                readOnly
                className="bg-muted text-muted-foreground"
                placeholder="Auto-generated from name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewStateName(''); setNewStateKey(''); setIsCreateStateModalOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateState}
              disabled={!newStateName.trim()}
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
            <DialogDescription>Add a new sound to this prop.</DialogDescription>
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
                placeholder="e.g. Swing Sound"
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
