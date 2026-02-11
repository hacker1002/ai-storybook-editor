import { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useCurrentStep } from '@/stores/editor-settings-store';
import { getIconsForStep, DEFAULT_ICONS, SETTING_ICON } from '@/constants/editor-constants';
import { IconRailItem } from './icon-rail-item';
import type { CreativeSpaceType } from '@/types/editor';

interface IconRailProps {
  activeCreativeSpace: CreativeSpaceType;
  onCreativeSpaceChange: (creativeSpace: CreativeSpaceType) => void;
}

export function IconRail({ activeCreativeSpace, onCreativeSpaceChange }: IconRailProps) {
  const currentStep = useCurrentStep();
  const stepIcons = getIconsForStep(currentStep);

  // Auto-select first icon when step changes and current space is invalid
  useEffect(() => {
    const validSpaces = [
      ...stepIcons.map((i) => i.id),
      ...DEFAULT_ICONS.map((i) => i.id),
      SETTING_ICON.id,
    ];

    if (!validSpaces.includes(activeCreativeSpace)) {
      onCreativeSpaceChange(stepIcons[0]?.id ?? 'doc');
    }
  }, [currentStep, activeCreativeSpace, onCreativeSpaceChange, stepIcons]);

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        role="navigation"
        aria-label="Creative spaces"
        className="flex h-full w-14 flex-col items-center border-r bg-background py-2"
      >
        {/* Step-specific icons (TOP) */}
        <div className="flex flex-col items-center gap-1">
          {stepIcons.map((item) => (
            <IconRailItem
              key={item.id}
              item={item}
              isActive={activeCreativeSpace === item.id}
              onClick={() => onCreativeSpaceChange(item.id)}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Default icons (BOTTOM) */}
        <div className="flex flex-col items-center gap-1">
          {DEFAULT_ICONS.map((item) => (
            <IconRailItem
              key={item.id}
              item={item}
              isActive={activeCreativeSpace === item.id}
              onClick={() => onCreativeSpaceChange(item.id)}
            />
          ))}
        </div>

        {/* Separator before settings */}
        <Separator className="my-2 w-8" />

        {/* Settings icon (isolated at bottom) */}
        <IconRailItem
          item={SETTING_ICON}
          isActive={activeCreativeSpace === SETTING_ICON.id}
          onClick={() => onCreativeSpaceChange(SETTING_ICON.id)}
        />
      </nav>
    </TooltipProvider>
  );
}
