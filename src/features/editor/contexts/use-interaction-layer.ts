// use-interaction-layer.ts — Hook for registering a component into the
// InteractionLayerStack. Returns { isActive, isInStack } for the registered slot.
//
// Spec: ai-storybook-design/srs/editor/interaction-layer-stack-spec.md §3.5

import { useState, useEffect, useRef } from "react";
import {
  useInteractionLayerContext,
  type Layer,
  type LayerSlot,
  type LayerStatus,
} from "./interaction-layer-provider";

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useInteractionLayer(
  slot: LayerSlot,
  layer: Layer | null
): LayerStatus {
  const ctx = useInteractionLayerContext();
  const prevIdRef = useRef<string | null>(null);
  const layerRef = useRef<Layer | null>(layer);

  // Always keep layerRef current so the stored proxy delegates to latest callbacks
  layerRef.current = layer;

  const [status, setStatus] = useState<LayerStatus>({
    isActive: false,
    isInStack: false,
  });

  const layerId = layer?.id ?? null;

  // ── Registration effect (runs when slot id changes or layer goes null/non-null) ──
  useEffect(() => {
    const stack = ctx.stackRef.current;
    const current = stack[slot];

    if (layer === null) {
      // Pop if we own this slot
      if (current && current.id === prevIdRef.current) {
        ctx.popSlot(slot, "state-change");
      }
      prevIdRef.current = null;
    } else if (!current) {
      // Empty slot — push
      ctx.pushSlot(slot, createProxy(layer, layerRef));
      prevIdRef.current = layer.id;
    } else if (current.id === layer.id) {
      // Same id — update handlers in-place via the proxy (layerRef already updated above)
      prevIdRef.current = layer.id;
    } else {
      // Different id — replace
      ctx.replaceSlot(slot, createProxy(layer, layerRef));
      prevIdRef.current = layer.id;
    }

    // Subscribe to status updates
    const key = `${slot}:${layer?.id ?? ""}`;
    const subscribers = ctx.subscribersRef.current;
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key)!.add(setStatus);

    // Compute initial status
    const topSlot = getTopActiveSlot(ctx.stackRef.current);
    setStatus({
      isActive: topSlot === slot,
      isInStack: ctx.stackRef.current[slot] !== null,
    });

    return () => {
      subscribers.get(key)?.delete(setStatus);
      if (subscribers.get(key)?.size === 0) subscribers.delete(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, slot]);

  // ── Unmount cleanup safety net ──
  useEffect(() => {
    return () => {
      if (prevIdRef.current) {
        const current = ctx.stackRef.current[slot];
        if (current?.id === prevIdRef.current) {
          ctx.popSlot(slot, "unmount");
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  return status;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTopActiveSlot(stack: {
  spread: unknown;
  item: unknown;
  modal: unknown;
}): LayerSlot | null {
  if (stack.modal) return "modal";
  if (stack.item) return "item";
  if (stack.spread) return "spread";
  return null;
}

/**
 * Creates a proxy Layer that always delegates to the latest layerRef.current.
 * This ensures handlers (closures) are always fresh without needing to re-register.
 */
function createProxy(
  layer: Layer,
  layerRef: React.MutableRefObject<Layer | null>
): Layer {
  return {
    id: layer.id,
    get ref() {
      return layerRef.current?.ref ?? layer.ref;
    },
    get hotkeys() {
      return layerRef.current?.hotkeys;
    },
    onHotkey(key) {
      layerRef.current?.onHotkey?.(key);
    },
    ...(layerRef.current?.onClickOutside
      ? {
          onClickOutside() {
            layerRef.current?.onClickOutside?.();
          },
        }
      : {}),

    onForcePop() {
      layerRef.current?.onForcePop?.();
    },
    get portalSelectors() {
      return layerRef.current?.portalSelectors;
    },
    get dropdownSelectors() {
      return layerRef.current?.dropdownSelectors;
    },
    get captureClickOutside() {
      return layerRef.current?.captureClickOutside;
    },
    get yieldedFrom() {
      return layerRef.current?.yieldedFrom;
    },
  };
}
