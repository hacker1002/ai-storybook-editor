// effect-type-grid.tsx - Grid of selectable animation effect type buttons grouped by category

import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { ResolvedAnimation, AvailableEffect, EffectCategory, ItemType } from '@/types/animation-types';
import {
  STAR_COLOR_MAP,
  EFFECT_CATEGORY_LABELS,
} from '@/constants/animation-constants';
import { getAvailableEffects, inferEffectTypeForComposite } from './animation-utils';
import { useRetouchSpreadIds, useRetouchSpreads } from '@/stores/snapshot-store/selectors';
import { useSpaceViewState, useEffectiveSpreadId } from '@/features/editor/hooks/use-space-view-state';

interface EffectTypeGridProps {
  animation: ResolvedAnimation;
  onEffectTypeChange: (newEffectType: number) => void;
  targetHasAudio?: boolean;
}

interface CategoryGroup {
  category: EffectCategory;
  effects: AvailableEffect[];
}

const CATEGORY_ORDER: EffectCategory[] = ['play', 'read-along', 'entrance', 'emphasis', 'camera', 'exit', 'motion-paths'];
const EXTENDED_CATEGORIES: EffectCategory[] = ['exit', 'motion-paths'];

function groupEffectsByCategory(effects: AvailableEffect[]): CategoryGroup[] {
  const map = new Map<EffectCategory, AvailableEffect[]>();

  for (const effect of effects) {
    const list = map.get(effect.category) ?? [];
    list.push(effect);
    map.set(effect.category, list);
  }

  return CATEGORY_ORDER
    .filter((cat) => map.has(cat))
    .map((cat) => ({ category: cat, effects: map.get(cat)! }));
}

function EffectButton({
  effect,
  isSelected,
  onSelect,
}: {
  effect: AvailableEffect;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = STAR_COLOR_MAP[effect.category];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex flex-col items-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors',
        isSelected
          ? 'text-white border-transparent'
          : 'text-muted-foreground border-border bg-background hover:bg-muted',
      ].join(' ')}
      style={isSelected ? { backgroundColor: color, borderColor: color } : undefined}
      title={effect.name}
    >
      <Star
        size={12}
        fill={isSelected ? '#fff' : color}
        stroke={isSelected ? '#fff' : color}
      />
      <span className="truncate w-full text-center leading-tight">{effect.name}</span>
    </button>
  );
}

function CategorySection({
  group,
  selectedEffectType,
  onEffectTypeChange,
}: {
  group: CategoryGroup;
  selectedEffectType: number;
  onEffectTypeChange: (id: number) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">
        {EFFECT_CATEGORY_LABELS[group.category]}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {group.effects.map((effect) => (
          <EffectButton
            key={effect.id}
            effect={effect}
            isSelected={selectedEffectType === effect.id}
            onSelect={() => onEffectTypeChange(effect.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function EffectTypeGrid({ animation, onEffectTypeChange, targetHasAudio }: EffectTypeGridProps) {
  const [showMore, setShowMore] = useState(false);

  // Resolve composite matrix when target.type === 'composite'.
  // We need the spread to look up the composite definition (its variants determine matrix).
  const retouchSpreadIds = useRetouchSpreadIds();
  const retouchSpreads = useRetouchSpreads();
  const { activeSpreadId } = useSpaceViewState('object');
  const effectiveSpreadId = useEffectiveSpreadId(activeSpreadId, retouchSpreadIds);

  const selectedTargetType = useMemo<ItemType | 'spread'>(() => {
    const targetType = animation.animation.target.type;
    if (targetType === 'spread') return 'spread';
    if (targetType !== 'composite') return targetType;
    const spread = retouchSpreads.find((s) => s.id === effectiveSpreadId);
    const composite = spread?.composites?.find((c) => c.id === animation.animation.target.id);
    return composite ? inferEffectTypeForComposite(composite) : 'image';
  }, [animation.animation.target, retouchSpreads, effectiveSpreadId]);

  const availableEffects = getAvailableEffects(selectedTargetType, targetHasAudio);
  const allGroups = groupEffectsByCategory(availableEffects);
  const selectedEffectType = animation.animation.effect.type;

  const primaryGroups = allGroups.filter((g) => !EXTENDED_CATEGORIES.includes(g.category));
  const extendedGroups = allGroups.filter((g) => EXTENDED_CATEGORIES.includes(g.category));
  const hasExtended = extendedGroups.length > 0;

  return (
    <div className="space-y-3">
      {primaryGroups.map((group) => (
        <CategorySection
          key={group.category}
          group={group}
          selectedEffectType={selectedEffectType}
          onEffectTypeChange={onEffectTypeChange}
        />
      ))}

      {hasExtended && showMore && extendedGroups.map((group) => (
        <CategorySection
          key={group.category}
          group={group}
          selectedEffectType={selectedEffectType}
          onEffectTypeChange={onEffectTypeChange}
        />
      ))}

      {hasExtended && (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? 'View fewer animations' : 'View more animations'}
        </button>
      )}
    </div>
  );
}
