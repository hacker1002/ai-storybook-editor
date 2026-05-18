// remix-inventory-section.tsx — Renders 3 sub-sections (Characters / Props /
// Mixes) inside an expanded accordion item. Each row exposes an eye icon
// callback for opening the swap-crop-sheet modal.

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canonicalMixKey } from '@/types/remix';
import type {
  RemixCharacter,
  RemixMix,
  RemixProp,
  SwapCropSheetTarget,
} from '@/types/remix';

interface Props {
  characters: RemixCharacter[];
  props: RemixProp[];
  mixes: RemixMix[];
  onOpenSwapCropSheet: (target: Omit<SwapCropSheetTarget, 'remixId'>) => void;
}

export function RemixInventorySection({
  characters,
  props,
  mixes,
  onOpenSwapCropSheet,
}: Props) {
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
              onEyeClick={() =>
                onOpenSwapCropSheet({ type: 'character', key: c.key })
              }
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
              onEyeClick={() =>
                onOpenSwapCropSheet({ type: 'prop', key: p.key })
              }
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
                onEyeClick={() =>
                  onOpenSwapCropSheet({ type: 'mix', key: mixKey })
                }
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
  onEyeClick,
}: {
  name: string;
  entityKey: string;
  onEyeClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          @{entityKey}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onEyeClick();
        }}
        aria-label={`Open swap sheet for ${name}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
