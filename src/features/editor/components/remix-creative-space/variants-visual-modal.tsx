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
import type { RemixEntityRef } from '@/types/remix';
import { useEntityVariantIllustrations } from '@/stores/remix-store/selectors';
import { useInteractionLayer } from '@/features/editor/contexts';
import type { Layer } from '@/features/editor/contexts';

import { SWAP_MODAL_TOKENS, Z_INDEX } from './swap-modal-constants';

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
  height: 'min(680px, calc(100vh - 80px))',
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

// Dark transparency checker — matches the mockup (subtle, two near-equal alpha
// whites over the modal's canvas surface). Tile size doubled vs default for a
// calmer pattern at large image sizes.
const CHECKER_BG: React.CSSProperties = {
  backgroundColor: 'var(--swap-modal-canvas-bg)',
  backgroundImage:
    'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, rgba(255,255,255,0.02) 0% 50%)',
  backgroundSize: '20px 20px',
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

const CANVAS_STYLE: React.CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 0,
  padding: 24,
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
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const illustrationsByVariant = useEntityVariantIllustrations(
    remixId,
    entity.type as 'character' | 'prop',
    entity.key,
  );

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

  // Resolve current illustration: selected → first → null.
  const { mediaUrl, activeVariantName } = useMemo(() => {
    const variant = entity.variants[activeIndex] ?? null;
    if (!variant) return { mediaUrl: null as string | null, activeVariantName: '' };
    const illustrations = illustrationsByVariant[variant.variantKey] ?? [];
    const chosen =
      illustrations.find((il) => il.is_selected) ?? illustrations[0] ?? null;
    return {
      mediaUrl: chosen?.media_url ?? null,
      activeVariantName: variant.name || variant.variantKey,
    };
  }, [entity.variants, activeIndex, illustrationsByVariant]);

  const handleTabClick = (i: number) => {
    if (i === activeIndex) return;
    const v = entity.variants[i];
    log.debug('handleTabClick', 'switch variant tab', {
      entityKey: entity.key,
      from: activeIndex,
      to: i,
      variantKey: v?.variantKey,
    });
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
            aria-label="Đóng"
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
            Chưa có variant nào — thêm sheet trước khi xem
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

            <div style={{ ...CANVAS_STYLE, ...CHECKER_BG }}>
              {mediaUrl ? (
                <img
                  src={mediaUrl}
                  alt={activeVariantName || 'variant'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: 8,
                  }}
                />
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--swap-modal-text-muted)',
                  }}
                >
                  Chưa có ảnh visual
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
