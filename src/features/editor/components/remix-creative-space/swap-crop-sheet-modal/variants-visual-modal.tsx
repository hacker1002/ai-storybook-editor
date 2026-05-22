// variants-visual-modal.tsx — Phase 05 of plan
// 260520-1140-variant-scoped-crop-sheets-dark-modal (post-migration).
//
// Overlay modal stacked ABOVE SwapCropSheetModal. Renders a hero canvas
// showing the selected illustration of a character/prop variant, with a
// tabs row switching between variants.
//
// Implementation: nested shadcn (Radix) Dialog + InteractionLayerStack.
// Rationale (supersedes the original "raw createPortal" decision):
//  • Radix owns pointer-events, scroll-lock, focus-scope, portal stacking —
//    a raw createPortal sibling inherits `pointer-events: none` from the
//    parent Radix Dialog's react-remove-scroll and clicks fall through.
//  • InteractionLayerStack owns click-outside + Esc routing so the parent
//    swap modal does not auto-dismiss when the child opens (Yielded Parent
//    pattern, ADR-019). Parent passes `yieldedFrom`; this layer registers
//    with it so cascade force-pops propagate to the parent.
//  • Radix auto-dismiss is suppressed on DialogContent via
//    onEscapeKeyDown/onInteractOutside/onPointerDownOutside preventDefault —
//    ILS is the single source of truth for those gestures.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Dialog, DialogContent, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { createLogger } from '@/utils/logger';
import type { Human } from '@/types/human';
import type { RemixEntityRef, SwapPreviewState } from '@/types/remix';
import {
  useEntityVariantIllustrations,
  useEntityVariantSwapUrls,
  useRemixConfigCharacter,
  useRemixActions,
} from '@/stores/remix-store/selectors';
import { useHumans } from '@/stores/humans-store';
import { useCharacters } from '@/stores/snapshot-store/selectors';
import { useInteractionLayer } from '@/features/editor/contexts';
import type { Layer } from '@/features/editor/contexts';

import { SWAP_MODAL_TOKENS, Z_INDEX } from './swap-modal-constants';
import { VariantsModalCanvas } from './variants-modal-canvas';
import { VariantsModalFooter } from './variants-modal-footer';
import { runVariantSwap } from '../utils/run-variant-swap';

const log = createLogger('Editor', 'VariantsVisualModal');

interface VariantsVisualModalProps {
  remixId: string;
  /** Must be character | prop. Mix entity defensive-returns null. */
  entity: RemixEntityRef;
  onClose: () => void;
  /** Yielded Parent linkage from SwapCropSheetModal — ILS routes parent
   *  force-pop through this when cascade-popping the modal slot. */
  yieldedFrom?: Layer['yieldedFrom'];
}

// ── Visual constants ─────────────────────────────────────────────────────────

const OVERLAY_STYLE: React.CSSProperties = {
  background: 'rgba(8, 10, 18, 0.86)',
  zIndex: Z_INDEX.variantsModal,
};

const CARD_STYLE: React.CSSProperties = {
  // Radix DialogContent already does fixed+centered via translate. We only
  // need to override width/max-h/padding/background/border/shadow and stack
  // above the parent swap modal (z-index 5000 > parent 4000).
  width: 'min(720px, calc(100vw - 80px))',
  maxWidth: 'none',
  height: 'min(760px, calc(100vh - 80px))',
  maxHeight: 'calc(100vh - 80px)',
  borderRadius: 14,
  background: 'var(--swap-modal-card-bg)',
  border: '1px solid var(--swap-modal-border)',
  boxShadow: '0 30px 60px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  padding: 0,
  gap: 0,
  color: 'var(--swap-modal-text-primary)',
  zIndex: Z_INDEX.variantsModal,
};

const HEADER_STYLE: React.CSSProperties = {
  height: 56,
  padding: '0 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flex: '0 0 auto',
};

const CLOSE_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--swap-modal-text-secondary)',
  width: 32,
  height: 32,
  borderRadius: 6,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const TABS_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '0 20px',
  borderBottom: '1px solid var(--swap-modal-border)',
  flex: '0 0 auto',
  overflowX: 'auto',
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active
      ? 'var(--swap-modal-text-primary)'
      : 'var(--swap-modal-text-muted)',
    borderBottom: active
      ? '2px solid var(--swap-modal-accent)'
      : '2px solid transparent',
    marginBottom: -1,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function VariantsVisualModal({
  remixId,
  entity,
  onClose,
  yieldedFrom,
}: VariantsVisualModalProps) {
  // Mix entity guarded at the caller (swap-crop-sheet-modal renders this
  // modal only when `modalEntity?.type !== 'mix'`). Hooks run unconditionally.
  const [activeIndex, setActiveIndex] = useState(0);
  // Per-variant swap task — modal-level, survives tab switch, lost on unmount
  // (mirror RemixConfigModal.swapTasks; NOT zustand / NOT background_jobs).
  const [swapTasks, setSwapTasks] = useState<Record<string, SwapPreviewState>>({});
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const entityType = entity.type as 'character' | 'prop';
  const illustrationsByVariant = useEntityVariantIllustrations(
    remixId,
    entityType,
    entity.key,
  );
  // AFTER source-of-truth — persisted visual_swap_url per variant.
  const swapUrlsByVariant = useEntityVariantSwapUrls(remixId, entityType, entity.key);
  // Frozen remix_config view (gating + swap request context). null for prop.
  const cfgChar = useRemixConfigCharacter(remixId, entity.key);
  const { setVariantVisualSwapUrl } = useRemixActions();

  // Swap request context — mirror RemixConfigModal: live humans cache (keyed by
  // id) + snapshot characters supply human_description / character_context.
  const humans = useHumans();
  const snapshotChars = useCharacters();
  const humansMap = useMemo<Record<string, Human>>(
    () => Object.fromEntries(humans.map((h) => [h.id, h])),
    [humans],
  );

  const setTask = (vk: string, state: SwapPreviewState) =>
    setSwapTasks((prev) => ({ ...prev, [vk]: state }));

  // Mount/unmount log.
  useEffect(() => {
    log.info('mount', 'open variants modal', {
      remixId,
      entityKey: entity.key,
      type: entity.type,
      variantCount: entity.variants.length,
    });
    return () => {
      log.debug('unmount', 'close variants modal', {
        remixId,
        entityKey: entity.key,
      });
    };
    // entity is stable per open (parent remounts via key={entity.key}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ILS registration — modal slot with Yielded Parent linkage. Esc + click-
  // outside route through ILS, not Radix. captureClickOutside keeps the
  // parent swap modal alive when this layer dismisses.
  useInteractionLayer('modal', {
    id: 'variants-visual-modal',
    ref: dialogContentRef,
    captureClickOutside: true,
    hotkeys: ['Escape'],
    onHotkey: (key) => {
      if (key === 'Escape') {
        log.debug('onHotkey', 'esc closes variants modal', {
          entityKey: entity.key,
        });
        onClose();
      }
    },
    onClickOutside: () => {
      log.debug('onClickOutside', 'click outside closes variants modal', {
        entityKey: entity.key,
      });
      onClose();
    },
    onForcePop: () => {
      log.warn('onForcePop', 'cascade force-pop closes variants modal', {
        entityKey: entity.key,
      });
      onClose();
    },
    yieldedFrom,
  });

  // Active variant + derived render inputs (design §2.3).
  const variant = entity.variants[activeIndex] ?? null;
  const variantKey = variant?.variantKey ?? null;
  const activeVariantName = variant ? variant.name || variant.variantKey : '';
  const task = variantKey ? swapTasks[variantKey] : undefined;

  // BEFORE = illustration is_selected → [0] → null. AFTER = persisted
  // visual_swap_url (source-of-truth) ?? optimistic task.afterUrl ?? null.
  const beforeUrl = useMemo<string | null>(() => {
    if (!variantKey) return null;
    const illustrations = illustrationsByVariant[variantKey] ?? [];
    const chosen =
      illustrations.find((il) => il.is_selected) ?? illustrations[0] ?? null;
    return chosen?.media_url ?? null;
  }, [variantKey, illustrationsByVariant]);

  const afterUrl =
    (variantKey ? swapUrlsByVariant[variantKey] : null) ?? task?.afterUrl ?? null;

  // Synthetic 'base' fallback guard (M1): `withSyntheticBaseFallback` (selectors)
  // can mint a display-only group keyed 'base' (or any orphan-sheet group) that
  // has NO matching real persistable variant. `swapUrlsByVariant` is keyed by
  // the REAL `variants[].key`, so a variantKey absent from it has no persist
  // target — Generate would no-op inside `setVariantVisualSwapUrl`'s "variant
  // not found" guard. Disable Generate for these (display-only) groups.
  const isPersistableVariant =
    variantKey != null &&
    Object.prototype.hasOwnProperty.call(swapUrlsByVariant, variantKey);

  // Generate gating — character only; needs a real persistable variant + human +
  // visual + normalized image + ≥1 enabled trait + a source sheet. (Prop →
  // cfgChar null → disabled.)
  const hasEnabledTrait = cfgChar?.traits.some((t) => t.is_enabled) ?? false;
  const canGenerate =
    entity.type === 'character' &&
    isPersistableVariant &&
    cfgChar?.human_id != null &&
    cfgChar?.visual != null &&
    cfgChar?.converted_image != null &&
    hasEnabledTrait &&
    beforeUrl != null;
  const isSwapping = task?.status === 'loading';

  // Tooltip reason when Generate is disabled (PII-safe — no human data).
  const disabledReason = useMemo<string | null>(() => {
    if (canGenerate) return null;
    if (entity.type !== 'character') return 'Generate is available for characters only.';
    if (!isPersistableVariant)
      return 'This variant is view-only (no real variant to save a swap to).';
    if (cfgChar == null) return 'This character is not configured for swap.';
    if (cfgChar.human_id == null || cfgChar.visual == null)
      return 'No human/visual selected for this character.';
    if (cfgChar.converted_image == null) return 'Run Extract for this human first.';
    if (!hasEnabledTrait) return 'Enable at least 1 trait.';
    if (beforeUrl == null) return 'No visual image to swap.';
    return null;
  }, [
    canGenerate,
    entity.type,
    isPersistableVariant,
    cfgChar,
    hasEnabledTrait,
    beforeUrl,
  ]);

  const handleGenerate = () => {
    if (!variantKey || !canGenerate) {
      log.warn('handleGenerate', 'blocked', {
        entityKey: entity.key,
        hasVariantKey: !!variantKey,
        canGenerate,
      });
      return;
    }
    log.info('handleGenerate', 'start variant swap', {
      entityKey: entity.key,
      variantKey,
    });
    void runVariantSwap(
      variantKey,
      cfgChar,
      beforeUrl,
      humansMap,
      snapshotChars,
      entity.key,
      setTask,
      (img) => setVariantVisualSwapUrl(remixId, entity.key, variantKey, img),
    );
  };

  const handleTabClick = (i: number) => {
    if (i === activeIndex) return;
    const v = entity.variants[i];
    log.debug('handleTabClick', 'switch variant tab', {
      entityKey: entity.key,
      from: activeIndex,
      to: i,
      variantKey: v?.variantKey,
    });
    // Switching tabs resets the compare position (slider remounts via
    // key={variantKey}); swapTasks are kept (per-variant, survive tab switch).
    setActiveIndex(i);
  };

  const handleCloseButton = () => {
    log.debug('handleCloseButton', 'close button clicked', {
      entityKey: entity.key,
    });
    onClose();
  };

  const titleId = `vvm-title-${entity.key}`;
  const hasVariants = entity.variants.length > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Safety net only — ILS handlers normally fire first via Esc capture
        // and mousedown. Reaching here means a Radix path we did not suppress.
        if (!open) {
          log.warn('onOpenChange', 'Radix forced close — ILS did not handle', {
            entityKey: entity.key,
          });
          onClose();
        }
      }}
    >
      {/* Override default overlay z-index (50) so it stacks above parent's 4000. */}
      <DialogOverlay style={OVERLAY_STYLE} />

      <DialogContent
        ref={dialogContentRef}
        aria-labelledby={titleId}
        // Suppress Radix auto-dismiss — ILS owns Esc + click-outside routing.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        // Re-declare modal tokens on the card — DialogContent portals into a
        // sibling of <body>, so vars set on the parent's DialogContent do not
        // cascade. Spread tokens BEFORE CARD_STYLE so CARD_STYLE wins on z-index.
        style={{ ...SWAP_MODAL_TOKENS, ...CARD_STYLE } as React.CSSProperties}
        // Hide the shadcn DialogContent built-in close button — the header
        // owns its own close control.
        className="[&>button]:hidden"
      >
        <DialogTitle id={titleId} className="sr-only">
          {entity.name} — variants
        </DialogTitle>

        <header style={HEADER_STYLE}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2
              aria-hidden="true"
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--swap-modal-text-primary)',
              }}
            >
              {entity.name}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--swap-modal-text-muted)',
              }}
            >
              @{entity.key}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseButton}
            aria-label="Close"
            style={CLOSE_BTN_STYLE}
          >
            <X size={18} />
          </button>
        </header>

        {!hasVariants ? (
          <div
            style={{
              flex: '1 1 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              color: 'var(--swap-modal-text-muted)',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            No variants yet — add a sheet before viewing
          </div>
        ) : (
          <>
            <div role="tablist" style={TABS_ROW_STYLE}>
              {entity.variants.map((group, i) => {
                const label = group.name || group.variantKey;
                const active = i === activeIndex;
                return (
                  <button
                    key={group.variantKey}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTabClick(i)}
                    style={tabButtonStyle(active)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <VariantsModalCanvas
              variantKey={variantKey}
              beforeUrl={beforeUrl}
              afterUrl={afterUrl}
              isSwapping={!!isSwapping}
              variantName={activeVariantName}
            />

            <VariantsModalFooter
              task={task}
              afterUrl={afterUrl}
              canGenerate={canGenerate}
              isSwapping={!!isSwapping}
              disabledReason={disabledReason}
              onGenerate={handleGenerate}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
