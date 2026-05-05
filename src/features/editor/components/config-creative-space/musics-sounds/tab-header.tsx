// tab-header.tsx
// Segmented tabs (MUSIC / SOUND / NARRATOR) for ConfigMusicsSoundsSettings.
// Local UI state — does not persist.

import type { MusicsSoundsTab } from '@/constants/config-constants';
import { cn } from '@/utils/utils';

interface TabDef {
  key: MusicsSoundsTab;
  label: string;
}

const TABS: ReadonlyArray<TabDef> = [
  { key: 'music', label: 'MUSIC' },
  { key: 'sound', label: 'SOUND' },
  { key: 'narrator', label: 'NARRATOR' },
];

export interface TabHeaderProps {
  activeTab: MusicsSoundsTab;
  onTabChange: (tab: MusicsSoundsTab) => void;
}

export function TabHeader({ activeTab, onTabChange }: TabHeaderProps) {
  return (
    <div
      role="tablist"
      className="flex h-14 shrink-0 items-center gap-4 border-b px-4"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              'border-b-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
