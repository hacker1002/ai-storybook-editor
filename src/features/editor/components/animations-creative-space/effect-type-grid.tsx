// effect-type-grid.tsx - Grid of selectable animation effect type buttons grouped by category

import { useState } from 'react';
import { Star } from 'lucide-react';
import type { ResolvedAnimation, AvailableEffect, EffectCategory } from '@/types/animation-types';
import {
  STAR_COLOR_MAP,
  EFFECT_CATEGORY_LABELS,
} from '@/constants/animation-constants';
import { getAvailableEffects } from './utils';

interface EffectTypeGridProps {
  animation: ResolvedAnimation;
  onEffectTypeChange: (newEffectType: number) => void;
}

interface CategoryGroup {
  category: EffectCategory;
  effects: AvailableEffect[];
}

const CATEGORY_ORDER: EffectCategory[] = ['play', 'entrance', 'emphasis', 'exit', 'motion-paths'];
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

export function EffectTypeGrid({ animation, onEffectTypeChange }: EffectTypeGridProps) {
  const [showMore, setShowMore] = useState(false);

  const availableEffects = getAvailableEffects(animation.animation.target.type);
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
