// interaction-layer-provider.tsx — Centralized keyboard and click-outside routing
// via a 3-slot fixed register: spread / item / modal (LIFO priority).
//
// Spec: ai-storybook-design/srs/editor/interaction-layer-stack-spec.md
// ADR:  docs/technical-decisions/adr-019-interaction-layer-stack-system.md

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "InteractionLayerProvider");

// ── Types ──────────────────────────────────────────────────────────────────────

export type LayerSlot = "spread" | "item" | "modal";

export interface Layer {
  id: string;
  ref: React.RefObject<HTMLElement | null>;
  hotkeys?: string[];
  onHotkey?: (key: string) => void;
  onClickOutside?: () => void;
  onForcePop?: () => void;
  portalSelectors?: string[];
  dropdownSelectors?: string[];
  captureClickOutside?: boolean;
}

export interface LayerStatus {
  isActive: boolean; // Is this the top active slot?
  isInStack: boolean; // Does this slot hold any layer?
}

export interface GlobalHotkeyEntry {
  id: string;
  match: (event: KeyboardEvent) => boolean;
  handler: (event: KeyboardEvent) => void;
}

type Subscriber = (status: LayerStatus) => void;

interface InteractionStack {
  spread: Layer | null;
  item: Layer | null;
  modal: Layer | null;
}

interface InteractionLayerContextValue {
  stackRef: React.MutableRefObject<InteractionStack>;
  subscribersRef: React.MutableRefObject<Map<string, Set<Subscriber>>>;
  pushSlot: (slot: LayerSlot, layer: Layer) => void;
  popSlot: (slot: LayerSlot, reason: string) => void;
  replaceSlot: (slot: LayerSlot, layer: Layer) => void;
  registerGlobalHotkey: (entry: GlobalHotkeyEntry) => () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const InteractionLayerContext =
  createContext<InteractionLayerContextValue | null>(null);

export function useInteractionLayerContext(): InteractionLayerContextValue {
  const ctx = useContext(InteractionLayerContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Editor][InteractionLayerProvider] useInteractionLayerContext called outside Provider"
      );
    }
    throw new Error(
      "useInteractionLayer must be used inside InteractionLayerProvider"
    );
  }
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SLOT_ORDER: LayerSlot[] = ["modal", "item", "spread"]; // top → bottom

/**
 * Returns true if the active element should receive raw keyboard input
 * (browser default) rather than triggering interaction layer hotkeys.
 *
 * Covers:
 * - Native form controls: INPUT, TEXTAREA, SELECT
 * - contentEditable elements (rich text editors ACTIVELY in edit mode)
 * - ARIA text-entry roles commonly wrapping real inputs: combobox,
 *   searchbox, spinbutton (used by Radix UI toolbar controls)
 *
 * Notably does NOT include role="textbox" alone — our canvas EditableTextbox
 * component uses role="textbox" + tabIndex=0 on its wrapper div for a11y
 * labeling while keeping contentEditable off until the user explicitly
 * enters edit mode. Treating a "selected but not editing" textbox as
 * editable would swallow the Delete/Arrow hotkeys the item layer needs.
 * A rich text editor that IS actively being edited will have
 * contentEditable=true and hit the check above.
 */
function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  const role = el.getAttribute("role");
  if (
    role === "combobox" ||
    role === "searchbox" ||
    role === "spinbutton"
  )
    return true;
  return false;
}

function getTopActiveSlot(stack: InteractionStack): LayerSlot | null {
  if (stack.modal) return "modal";
  if (stack.item) return "item";
  if (stack.spread) return "spread";
  return null;
}

function isClickInsideLayer(layer: Layer, target: Element): boolean {
  if (layer.ref.current?.contains(target)) return true;
  if (layer.portalSelectors) {
    for (const sel of layer.portalSelectors) {
      if (target.closest(sel)) return true;
    }
  }
  return false;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function InteractionLayerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const stackRef = useRef<InteractionStack>({
    spread: null,
    item: null,
    modal: null,
  });
  const subscribersRef = useRef<Map<string, Set<Subscriber>>>(new Map());
  const globalHotkeysRef = useRef<GlobalHotkeyEntry[]>([]);

  const registerGlobalHotkey = useCallback((entry: GlobalHotkeyEntry) => {
    globalHotkeysRef.current.push(entry);
    log.debug('registerGlobalHotkey', 'register', { id: entry.id });
    return () => {
      globalHotkeysRef.current = globalHotkeysRef.current.filter(
        (e) => e.id !== entry.id
      );
      log.debug('registerGlobalHotkey', 'unregister', { id: entry.id });
    };
  }, []);

  // Notify subscribers for a slot when its state changes
  const notifySlot = (slot: LayerSlot) => {
    const stack = stackRef.current;
    const topSlot = getTopActiveSlot(stack);
    const layer = stack[slot];
    const isActive = topSlot === slot;
    const isInStack = layer !== null;

    const key = `${slot}:${layer?.id ?? ""}`;
    subscribersRef.current
      .get(key)
      ?.forEach((cb) => cb({ isActive, isInStack }));
    // Also notify with empty id in case subscriber used undefined id
    subscribersRef.current
      .get(`${slot}:`)
      ?.forEach((cb) => cb({ isActive, isInStack }));
  };

  // Cascade pop upper slots (slots above fromSlot in priority order)
  const cascadePopUpperSlots = (fromSlot: LayerSlot) => {
    const stack = stackRef.current;
    if (fromSlot === "spread") {
      if (stack.modal) {
        log.warn("cascadePopUpperSlots", "force-pop modal", {
          reason: "spread-change",
        });
        stack.modal.onForcePop?.();
        stack.modal = null;
        notifySlot("modal");
      }
      if (stack.item) {
        log.warn("cascadePopUpperSlots", "force-pop item", {
          reason: "spread-change",
        });
        stack.item.onForcePop?.();
        stack.item = null;
        notifySlot("item");
      }
    } else if (fromSlot === "item") {
      if (stack.modal) {
        log.warn("cascadePopUpperSlots", "force-pop modal", {
          reason: "item-change",
        });
        stack.modal.onForcePop?.();
        stack.modal = null;
        notifySlot("modal");
      }
    }
  };

  const pushSlot = (slot: LayerSlot, layer: Layer) => {
    log.info("pushSlot", "layer.push", { slot, layerId: layer.id });
    cascadePopUpperSlots(slot);
    stackRef.current[slot] = layer;
    notifySlot(slot);
  };

  const popSlot = (slot: LayerSlot, reason: string) => {
    const layer = stackRef.current[slot];
    if (!layer) return;
    log.info("popSlot", "layer.pop", { slot, layerId: layer.id, reason });
    stackRef.current[slot] = null;
    notifySlot(slot);
  };

  const replaceSlot = (slot: LayerSlot, layer: Layer) => {
    const old = stackRef.current[slot];
    if (old) {
      log.info("replaceSlot", "layer.replace", {
        slot,
        oldId: old.id,
        newId: layer.id,
      });
    }
    cascadePopUpperSlots(slot);
    stackRef.current[slot] = layer;
    notifySlot(slot);
  };

  // Document event listeners
  useEffect(() => {
    // Snapshot whether a dropdown is open at the START of each click sequence
    // (pointerdown capture fires before Radix's pointerdown bubble handler, which
    // is what closes the Select and schedules a React re-render to remove the content
    // from the DOM. By the time mousedown fires, the element may already be gone.)
    let dropdownOpenOnLastPointerDown = false;

    const handlePointerDownCapture = () => {
      dropdownOpenOnLastPointerDown = SLOT_ORDER.some((slot) => {
        const layer = stackRef.current[slot];
        return (
          layer?.dropdownSelectors?.some(
            (sel) => document.querySelector(sel) !== null
          ) ?? false
        );
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Global hotkey loop: runs before slot-scoped routing.
      // preventDefault fires before editable-element guard so combos like Ctrl+D
      // are always captured (prevents browser bookmark dialog, etc.).
      for (const entry of globalHotkeysRef.current) {
        if (entry.match(e)) {
          e.preventDefault();
          e.stopPropagation();
          if (!isEditableElement(document.activeElement)) {
            entry.handler(e);
          }
          return;
        }
      }

      // Escape is a universal dismiss key — it must bypass the editable-element
      // guard so modals can always close even when focus is in an input/textarea.
      // Other hotkeys (Delete, Arrow, Backspace) remain blocked to not interfere
      // with text editing. Radix dropdowns that handle their own Escape will have
      // stopped propagation before reaching this document-level listener.
      if (e.key !== "Escape" && isEditableElement(document.activeElement)) return;

      const topSlot = getTopActiveSlot(stackRef.current);
      if (!topSlot) return;

      const layer = stackRef.current[topSlot];
      if (!layer?.hotkeys?.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();
      log.debug("handleKeyDown", "hotkey.fire", {
        slot: topSlot,
        key: e.key,
        layerId: layer.id,
      });
      layer.onHotkey?.(e.key);
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      const layersToPop: { slot: LayerSlot; layer: Layer }[] = [];

      for (const slot of SLOT_ORDER) {
        const layer = stackRef.current[slot];
        if (!layer) continue;

        if (isClickInsideLayer(layer, target)) {
          // INSIDE this slot — stop walking, pop only what's accumulated above
          break;
        } else if (
          dropdownOpenOnLastPointerDown &&
          layer.dropdownSelectors?.length
        ) {
          // A dropdown belonging to this layer was open when the click started
          // (snapshotted in the pointerdown capture listener, before Radix's own
          // pointerdown handler gets a chance to close and unmount it).
          // Treat this click as "dismiss dropdown, keep item selected".
          break;
        } else {
          // Opt-out: layers without onClickOutside do NOT respond to click-outside.
          // They remain registered (e.g. spread slot stays active regardless of where
          // the user clicks). Walk past this slot without queuing a pop.
          if (!layer.onClickOutside) {
            continue;
          }
          layersToPop.push({ slot, layer });
          if (layer.captureClickOutside) {
            // Capture mode: pop only this slot, stop
            break;
          }
          // Otherwise continue down the stack
        }
      }

      for (const { slot, layer } of layersToPop) {
        log.debug("handleMouseDown", "clickOutside.fire", {
          slot,
          layerId: layer.id,
        });
        layer.onClickOutside?.();
        stackRef.current[slot] = null;
        notifySlot(slot);
      }
    };

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__interactionStack =
        stackRef.current;
    }

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownCapture,
        true
      );
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>)
          .__interactionStack;
      }
    };
  }, []);

  return (
    <InteractionLayerContext.Provider
      value={{ stackRef, subscribersRef, pushSlot, popSlot, replaceSlot, registerGlobalHotkey }}
    >
      {children}
    </InteractionLayerContext.Provider>
  );
}
