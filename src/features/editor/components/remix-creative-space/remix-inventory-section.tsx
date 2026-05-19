// remix-inventory-section.tsx — Renders 3 sub-sections (Characters / Props /
// Mixes) inside an expanded accordion item. Each character row shows a
// `name → humanDisplayName` arrow when `remix_config.characters[].human_id` is
// set; otherwise bare name. Prop arrow target intentionally skipped — items
// library still TBD (see remix-config-modal.tsx PROPS section comment).

import { useMemo } from 'react';
import { canonicalMixKey } from '@/types/remix';
import type {
  RemixCharacter,
  RemixConfig,
  RemixMix,
  RemixProp,
} from '@/types/remix';
import { useHumans } from '@/stores/humans-store';
import { useLanguageCode } from '@/stores/editor-settings-store';
import type { Human } from '@/types/human';

interface Props {
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  remixConfig: RemixConfig;
}

export function RemixInventorySection({
  characters,
  props,
  mixes,
  remixConfig,
}: Props) {
  const humans = useHumans();
  const langCode = useLanguageCode();

  const humanById = useMemo<Map<string, Human>>(
    () => new Map(humans.map((h) => [h.id, h])),
    [humans],
  );

  const resolveCharacterTarget = (entityKey: string): string | null => {
    const choice = remixConfig.characters.find((c) => c.key === entityKey);
    if (!choice?.human_id) return null;
    const human = humanById.get(choice.human_id);
    if (!human) return null;
    return human.displayName[langCode] || human.sourceName || null;
  };

  const hasAny = characters.length > 0 || props.length > 0 || mixes.length > 0;
  if (!hasAny) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        No inventory in this remix.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {characters.length > 0 && (
        <SubSection label="Characters">
          {characters.map((c) => (
            <InventoryRow
              key={`char-${c.key}`}
              name={c.name}
              entityKey={c.key}
              targetName={resolveCharacterTarget(c.key)}
            />
          ))}
        </SubSection>
      )}
      {props.length > 0 && (
        <SubSection label="Props">
          {props.map((p) => (
            <InventoryRow
              key={`prop-${p.key}`}
              name={p.name}
              entityKey={p.key}
              targetName={null}
            />
          ))}
        </SubSection>
      )}
      {mixes.length > 0 && (
        <SubSection label="Mixes">
          {mixes.map((m) => {
            const mixKey = canonicalMixKey(m.keys);
            return (
              <InventoryRow
                key={`mix-${mixKey}`}
                name={m.name}
                entityKey={mixKey}
                targetName={null}
              />
            );
          })}
        </SubSection>
      )}
    </div>
  );
}

function SubSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-2 pb-1 text-xs text-muted-foreground">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InventoryRow({
  name,
  entityKey,
  targetName,
}: {
  name: string;
  entityKey: string;
  targetName: string | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">
          {name}
          {targetName && (
            <>
              <span className="mx-1.5 text-muted-foreground">→</span>
              <span className="font-normal text-muted-foreground">
                {targetName}
              </span>
            </>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          @{entityKey}
        </span>
      </div>
    </div>
  );
}
