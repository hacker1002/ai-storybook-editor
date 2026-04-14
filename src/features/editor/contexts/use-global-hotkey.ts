// use-global-hotkey.ts — Utility hook for registering a global keyboard shortcut
// via InteractionLayerProvider's global hotkey API.
// Spec: ai-storybook-design/srs/editor/interaction-layer-stack-spec.md §3.6

import { useEffect } from "react";
import { useInteractionLayerContext, type GlobalHotkeyEntry } from "./interaction-layer-provider";

/**
 * Registers a global hotkey while the component is mounted.
 * Automatically re-registers when deps change, unregisters on unmount.
 *
 * @param match  - Function returning true when the event should trigger the handler
 * @param handler - Callback to invoke (provider has already called preventDefault)
 * @param deps   - React deps array; include all values captured in match/handler closures
 */
export function useGlobalHotkey(
  match: (event: KeyboardEvent) => boolean,
  handler: (event: KeyboardEvent) => void,
  deps: React.DependencyList
): void {
  const { registerGlobalHotkey } = useInteractionLayerContext();

  useEffect(() => {
    const id = `global-hotkey-${crypto.randomUUID()}`;
    const entry: GlobalHotkeyEntry = { id, match, handler };
    const unregister = registerGlobalHotkey(entry);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerGlobalHotkey, ...deps]);
}
