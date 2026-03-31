// setting-button.tsx - Gear icon button for spread settings
"use client";

import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SettingButton');

interface SettingButtonProps {
  onClick: () => void;
}

export function SettingButton({ onClick }: SettingButtonProps) {
  const handleClick = () => {
    log.info('SettingButton', 'clicked');
    onClick();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 bg-background/80 hover:bg-background shadow-sm"
      onClick={handleClick}
      aria-label="Spread settings"
    >
      <Settings className="h-3.5 w-3.5" />
    </Button>
  );
}

export default SettingButton;
