// config-sidebar.tsx - Navigation sidebar for ConfigCreativeSpace.
// Renders 10 section items from CONFIG_SECTIONS; highlights the active section.

import * as React from 'react';
import * as Icons from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import { CONFIG_SECTIONS, type ConfigSection } from '@/constants/config-constants';

const log = createLogger('Editor', 'ConfigSidebar');

export interface ConfigSidebarProps {
  activeSection: ConfigSection;
  onSectionChange: (section: ConfigSection) => void;
}

export function ConfigSidebar({ activeSection, onSectionChange }: ConfigSidebarProps) {
  const handleClick = React.useCallback(
    (section: ConfigSection) => {
      if (section === activeSection) return;
      log.info('handleClick', 'section changed', { from: activeSection, to: section });
      onSectionChange(section);
    },
    [activeSection, onSectionChange]
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Settings</h2>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {CONFIG_SECTIONS.map((item) => {
          const isActive = item.key === activeSection;
          // Dynamically resolve lucide icon by name
          const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon];

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleClick(item.key)}
              className={cn(
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-blue-50 font-medium text-blue-600'
              )}
            >
              {IconComponent ? (
                <IconComponent className="h-4 w-4 shrink-0" />
              ) : (
                <span className="h-4 w-4 shrink-0" />
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
