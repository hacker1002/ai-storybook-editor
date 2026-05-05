// config-creative-space.tsx - Root component for book configuration settings.
// Sidebar navigation + panel switch between general, objects, text, narrator, and future sections.

import * as React from 'react';
import { ConfigSidebar } from './config-sidebar';
import { ConfigGeneralSettings } from './config-general-settings';
import { ConfigObjectSettings } from './config-object-settings';
import { ConfigTextSettings } from './config-text-settings';
import { ConfigNarratorSettings } from './config-narrator-settings';
import { ConfigBranchSettings } from './config-branch-settings';
import { ConfigLayoutSettings } from './config-layout-settings';
import { ConfigMusicsSoundsSettings } from './musics-sounds/config-musics-sounds-settings';
import type { ConfigSection } from '@/constants/config-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigCreativeSpace');

function PlaceholderPanel({ section }: { section: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {section} — coming soon
    </div>
  );
}

export function ConfigCreativeSpace() {
  const [activeSection, setActiveSection] = React.useState<ConfigSection>('general');

  const handleSectionChange = React.useCallback((section: ConfigSection) => {
    log.info('handleSectionChange', 'navigated', { section });
    setActiveSection(section);
  }, []);

  const renderPanel = () => {
    switch (activeSection) {
      case 'general': return <ConfigGeneralSettings />;
      case 'objects': return <ConfigObjectSettings />;
      case 'text':    return <ConfigTextSettings />;
      case 'narrator': return <ConfigNarratorSettings />;
      case 'musics-sounds': return <ConfigMusicsSoundsSettings />;
      case 'branch':  return <ConfigBranchSettings />;
      case 'layout':  return <ConfigLayoutSettings />;
      default:        return <PlaceholderPanel section={activeSection} />;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConfigSidebar activeSection={activeSection} onSectionChange={handleSectionChange} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {renderPanel()}
      </main>
    </div>
  );
}
