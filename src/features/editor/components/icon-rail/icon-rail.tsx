import { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useCurrentStep } from '@/stores/editor-settings-store';
import {
  getIconsForStep,
  DEFAULT_ICONS,
  PREVIEW_ICON,
  SETTING_ICON,
  DEFAULT_GATED,
  ENTITY_RESOURCE_MAP,
} from '@/constants/editor-constants';
import { IconRailItem } from './icon-rail-item';
import type { CreativeSpaceType, IconRailItemConfig } from '@/types/editor';
import type { AccessRights } from '@/features/editor/components/collaborators-creative-space/collaboration-space-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'IconRail');

interface IconRailProps {
  activeCreativeSpace: CreativeSpaceType;
  onCreativeSpaceChange: (creativeSpace: CreativeSpaceType) => void;
  /**
   * Collaboration-mode gating (viewer = non-owner). `isOwner` short-circuits ALL
   * gating first → owner behaves EXACTLY as before (zero regression). `myRights` =
   * the viewer's OWN access matrix (null for owner, or defensively-null non-owner →
   * disable everything). UX-only gate; the real fence is RLS + authz gateway.
   */
  isOwner: boolean;
  myRights: AccessRights | null;
}

export function IconRail({ activeCreativeSpace, onCreativeSpaceChange, isOwner, myRights }: IconRailProps) {
  const currentStep = useCurrentStep();
  const stepIcons = getIconsForStep(currentStep);

  // Normalize an ENTITY_RESOURCE_MAP value (string | string[] | undefined) to a
  // resource-key list. '' / null / undefined → [] (ungated, e.g. preview).
  const toArray = (v: string | string[] | undefined): string[] =>
    v == null || v === '' ? [] : Array.isArray(v) ? v : [v];
  const resolveResources = (item: IconRailItemConfig): string[] =>
    toArray(ENTITY_RESOURCE_MAP[item.id]);

  // Derive per-item disabled state (render-time only, never stored). Owner path
  // short-circuits FIRST → isDisabled always false → no styling/behavior change.
  const isDisabled = (item: IconRailItemConfig): boolean => {
    if (isOwner) return false;
    if (!myRights) return true; // non-owner with no rights row → disable all (defensive)
    if (DEFAULT_GATED.has(item.id)) return true; // history/issue/share/collaborator/setting
    const resources = resolveResources(item);
    if (resources.length) {
      // any-of gate (design §4.5): sketch base/variant/lineup span BOTH
      // characters + props → disable ONLY when EVERY mapped resource is un-granted.
      return resources.every(
        (r) => !(myRights.steps[currentStep]?.resources?.[r] ?? false),
      );
    }
    return false; // preview (and any unmapped id) → active
  };

  // Guarded change: a disabled item must not switch the creative space (no-op). The
  // IconRailItem also self-guards; this is defense-in-depth so onCreativeSpaceChange
  // is never called for a gated item.
  const handleItemClick = (item: IconRailItemConfig) => {
    if (isDisabled(item)) {
      log.debug('handleItemClick', 'disabled item click ignored (no-op)', { id: item.id });
      return;
    }
    onCreativeSpaceChange(item.id);
  };

  // Auto-select first icon when step changes and current space is invalid
  useEffect(() => {
    const validSpaces = [
      ...stepIcons.map((i) => i.id),
      ...DEFAULT_ICONS.map((i) => i.id),
      PREVIEW_ICON.id,
      SETTING_ICON.id,
    ];

    if (!validSpaces.includes(activeCreativeSpace)) {
      onCreativeSpaceChange(stepIcons[0]?.id ?? 'sketch-base');
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
              item={{ ...item, isDisabled: isDisabled(item) }}
              isActive={activeCreativeSpace === item.id}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Preview icon (always visible — uses retouch animation data) */}
        <div className="flex flex-col items-center gap-1 mb-1">
          <IconRailItem
            item={{ ...PREVIEW_ICON, isDisabled: isDisabled(PREVIEW_ICON) }}
            isActive={activeCreativeSpace === PREVIEW_ICON.id}
            onClick={() => handleItemClick(PREVIEW_ICON)}
          />
        </div>

        {/* Default icons (BOTTOM) */}
        <div className="flex flex-col items-center gap-1">
          {DEFAULT_ICONS.map((item) => (
            <IconRailItem
              key={item.id}
              item={{ ...item, isDisabled: isDisabled(item) }}
              isActive={activeCreativeSpace === item.id}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>

        {/* Separator before settings */}
        <Separator className="my-2 w-8" />

        {/* Settings icon (isolated at bottom) */}
        <IconRailItem
          item={{ ...SETTING_ICON, isDisabled: isDisabled(SETTING_ICON) }}
          isActive={activeCreativeSpace === SETTING_ICON.id}
          onClick={() => handleItemClick(SETTING_ICON)}
        />
      </nav>
    </TooltipProvider>
  );
}
