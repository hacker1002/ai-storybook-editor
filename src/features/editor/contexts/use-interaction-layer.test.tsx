// use-interaction-layer.test.tsx
// Unit tests for useInteractionLayer hook — handler freshness + unmount cleanup.
// Vitest 4 + jsdom + @testing-library/react.

import React, { useRef, useState } from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InteractionLayerProvider } from "./interaction-layer-provider";
import { useInteractionLayer } from "./use-interaction-layer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function keydown(key: string) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <InteractionLayerProvider>{children}</InteractionLayerProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useInteractionLayer — handler freshness + unmount cleanup", () => {
  // Handler freshness: proxy reads latest closure without re-registration.
  it("proxy reads latest onHotkey closure after re-render", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    function Item() {
      const ref = useRef<HTMLDivElement>(null);
      const [handler, setHandler] = useState<(k: string) => void>(() => fn1);
      useInteractionLayer("item", { id: "i1", hotkeys: ["Delete"], onHotkey: handler, ref });
      return (
        <div ref={ref}>
          <button data-testid="swap" onClick={() => setHandler(() => fn2)} />
        </div>
      );
    }

    const { getByTestId } = render(
      <Wrap>
        <Item />
      </Wrap>
    );

    keydown("Delete");
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();

    act(() => { getByTestId("swap").click(); });
    fn1.mockClear();

    keydown("Delete");
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn1).not.toHaveBeenCalled();
  });

  // Unmount cleanup: after unmount, hotkeys no longer fire.
  it("after unmount hotkeys no longer fire", () => {
    const onHotkey = vi.fn();

    function Item() {
      const ref = useRef<HTMLDivElement>(null);
      useInteractionLayer("item", { id: "i1", hotkeys: ["Delete"], onHotkey, ref });
      return <div ref={ref} />;
    }

    function App() {
      const [mounted, setMounted] = useState(true);
      return (
        <Wrap>
          {mounted && <Item />}
          <button data-testid="unmount" onClick={() => setMounted(false)} />
        </Wrap>
      );
    }

    const { getByTestId } = render(<App />);

    keydown("Delete");
    expect(onHotkey).toHaveBeenCalledTimes(1);

    act(() => { getByTestId("unmount").click(); });
    onHotkey.mockClear();

    keydown("Delete");
    expect(onHotkey).not.toHaveBeenCalled();
  });
});
