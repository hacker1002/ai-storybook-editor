// settings-tab-panel.tsx - Lists all stage settings as collapsible accordion items

import { useState } from 'react';
import type { StageSetting } from '@/types/stage-types';
import { SettingItem } from './setting-item';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SettingsTabPanel');

interface SettingsTabPanelProps {
  stageKey: string;
  settings: StageSetting[];
}

// NOTE: Parent must render with key={stageKey} so this component remounts on stage change,
// resetting expandedSettingKey to the first setting automatically.
export function SettingsTabPanel({ stageKey, settings }: SettingsTabPanelProps) {
  const firstKey = settings.length > 0 ? settings[0].key : null;
  log.debug('mount/render', 'init', { stageKey, firstKey });
  const [expandedSettingKey, setExpandedSettingKey] = useState<string | null>(firstKey);

  const handleToggle = (settingKey: string) => {
    setExpandedSettingKey((prev) => {
      const next = prev === settingKey ? null : settingKey;
      log.debug('handleToggle', 'toggle setting', { settingKey, next });
      return next;
    });
  };

  if (settings.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No settings yet. Click + to add one.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-100px)]">
      {settings.map((setting) => (
        <SettingItem
          key={setting.key}
          stageKey={stageKey}
          settingData={setting}
          isExpanded={expandedSettingKey === setting.key}
          onToggle={() => handleToggle(setting.key)}
        />
      ))}
    </div>
  );
}
