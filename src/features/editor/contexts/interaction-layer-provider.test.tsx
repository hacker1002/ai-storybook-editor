// interaction-layer-provider.test.tsx
// Unit tests for InteractionLayerProvider + useInteractionLayer (20 scenarios).
// Spec §4 Behaviors matrix — Vitest 4 + jsdom.

import React, { useRef, useState } from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InteractionLayerProvider } from "./interaction-layer-provider";
import { useInteractionLayer } from "./use-interaction-layer";
import type { Layer, LayerSlot } from "./interaction-layer-provider";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Layer config without `ref` — supplied internally by Slot component. */
type LayerConfig = Omit<Layer, "ref">;

/**
 * Minimal component that registers a slot.
 * Renders a <div> that becomes the layer's ref element.
 */
function Slot({
  slot,
  config,
  testId,
}: {
  slot: LayerSlot;
  config: LayerConfig | null;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useInteractionLayer(slot, config ? { ...config, ref } : null);
  return <div ref={ref} data-testid={testId ?? slot} />;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <InteractionLayerProvider>{children}</InteractionLayerProvider>;
}

/** Fire a keydown event at the document level (where the provider listens). */
function keydown(key: string) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

/** Fire a mousedown event (used for click-outside detection). */
function mousedown(target: Element = document.body) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
  });
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe("InteractionLayerProvider + useInteractionLayer — 20 scenarios", () => {
  // 1. Push spread slot — isActive, responds to hotkeys
  it("01: spread slot responds to hotkeys when it is the only slot", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    keydown("Delete");
    expect(onHotkey).toHaveBeenCalledWith("Delete");
  });

  // 2. Push item slot — item active, spread in stack but not top
  it("02: item slot wins over spread for hotkey dispatch", () => {
    const spreadFn = vi.fn();
    const itemFn = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: ["Delete"], onHotkey: spreadFn }} />
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey: itemFn }} />
      </Wrap>
    );
    keydown("Delete");
    expect(itemFn).toHaveBeenCalledWith("Delete");
    expect(spreadFn).not.toHaveBeenCalled();
  });

  // 3. Push modal slot — modal is top, item + spread remain in stack
  it("03: modal slot wins when spread + item + modal all registered", () => {
    const spreadFn = vi.fn();
    const itemFn = vi.fn();
    const modalFn = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: ["Escape"], onHotkey: spreadFn }} />
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Escape"], onHotkey: itemFn }} />
        <Slot slot="modal" config={{ id: "m1", hotkeys: ["Escape"], onHotkey: modalFn }} />
      </Wrap>
    );
    keydown("Escape");
    expect(modalFn).toHaveBeenCalledWith("Escape");
    expect(itemFn).not.toHaveBeenCalled();
    expect(spreadFn).not.toHaveBeenCalled();
  });

  // 4. Pop modal → item becomes active
  it("04: popping modal (set null) makes item slot active", () => {
    const itemFn = vi.fn();
    const modalFn = vi.fn();

    function App() {
      const [showModal, setShowModal] = useState(true);
      return (
        <Wrap>
          <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey: itemFn }} />
          {showModal && (
            <Slot slot="modal" config={{ id: "m1", hotkeys: ["Delete"], onHotkey: modalFn }} />
          )}
          <button data-testid="close" onClick={() => setShowModal(false)} />
        </Wrap>
      );
    }

    const { getByTestId } = render(<App />);
    keydown("Delete");
    expect(modalFn).toHaveBeenCalledTimes(1);
    expect(itemFn).not.toHaveBeenCalled();

    act(() => { getByTestId("close").click(); });
    modalFn.mockClear();

    keydown("Delete");
    expect(itemFn).toHaveBeenCalledWith("Delete");
    expect(modalFn).not.toHaveBeenCalled();
  });

  // 5. Replace spread → cascade pop modal + item, onForcePop called on both
  it("05: replacing spread cascades onForcePop to modal and item", () => {
    const itemForcePop = vi.fn();
    const modalForcePop = vi.fn();

    function App() {
      const [spreadId, setSpreadId] = useState("s1");
      return (
        <Wrap>
          <Slot slot="spread" config={{ id: spreadId, hotkeys: [] }} />
          <Slot slot="item" config={{ id: "i1", hotkeys: [], onForcePop: itemForcePop }} />
          <Slot slot="modal" config={{ id: "m1", hotkeys: [], onForcePop: modalForcePop }} />
          <button data-testid="switch" onClick={() => setSpreadId("s2")} />
        </Wrap>
      );
    }

    const { getByTestId } = render(<App />);
    act(() => { getByTestId("switch").click(); });

    expect(itemForcePop).toHaveBeenCalledTimes(1);
    expect(modalForcePop).toHaveBeenCalledTimes(1);
  });

  // 6. Cascade pop fires onForcePop, NOT onClickOutside
  it("06: cascade pop calls onForcePop, not onClickOutside", () => {
    const clickOutside = vi.fn();
    const forcePop = vi.fn();

    function App() {
      const [spreadId, setSpreadId] = useState("s1");
      return (
        <Wrap>
          <Slot slot="spread" config={{ id: spreadId, hotkeys: [] }} />
          <Slot
            slot="modal"
            config={{ id: "m1", hotkeys: [], onClickOutside: clickOutside, onForcePop: forcePop }}
          />
          <button data-testid="switch" onClick={() => setSpreadId("s2")} />
        </Wrap>
      );
    }

    const { getByTestId } = render(<App />);
    act(() => { getByTestId("switch").click(); });

    expect(forcePop).toHaveBeenCalledTimes(1);
    expect(clickOutside).not.toHaveBeenCalled();
  });

  // 7. Same-id re-register → proxy reads latest closure (handler freshness)
  it("07: handler freshness — re-render with new handler fires new handler", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    function App() {
      const [fn, setFn] = useState<(k: string) => void>(() => fn1);
      return (
        <Wrap>
          <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey: fn }} />
          <button data-testid="swap" onClick={() => setFn(() => fn2)} />
        </Wrap>
      );
    }

    const { getByTestId } = render(<App />);
    keydown("Delete");
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();

    act(() => { getByTestId("swap").click(); });
    fn1.mockClear();

    keydown("Delete");
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn1).not.toHaveBeenCalled();
  });

  // 8. Click inside ref.current → no pop
  it("08: click inside layer ref does not call onClickOutside", () => {
    const onClickOutside = vi.fn();
    const { getByTestId } = render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: [], onClickOutside }} testId="item-el" />
      </Wrap>
    );
    mousedown(getByTestId("item-el"));
    expect(onClickOutside).not.toHaveBeenCalled();
  });

  // 9. Click inside portalSelectors → no pop
  it("09: click inside a portal selector element does not call onClickOutside", () => {
    const onClickOutside = vi.fn();
    render(
      <Wrap>
        <Slot
          slot="item"
          config={{
            id: "i1",
            hotkeys: [],
            onClickOutside,
            portalSelectors: ['[data-portal="true"]'],
          }}
        />
      </Wrap>
    );
    const portal = document.createElement("div");
    portal.setAttribute("data-portal", "true");
    document.body.appendChild(portal);
    try {
      mousedown(portal);
      expect(onClickOutside).not.toHaveBeenCalled();
    } finally {
      portal.remove();
    }
  });

  // 10. Click outside all layers (no captureClickOutside) → pop layers with onClickOutside
  it("10: click outside pops all layers that have onClickOutside", () => {
    const onClickOutside = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: [] }} /> {/* no onClickOutside */}
        <Slot slot="item" config={{ id: "i1", hotkeys: [], onClickOutside }} />
      </Wrap>
    );
    mousedown(document.body);
    expect(onClickOutside).toHaveBeenCalledTimes(1);
  });

  // 11. captureClickOutside: true → pop only modal, item not popped
  it("11: captureClickOutside stops walk at modal, item stays active", () => {
    const itemClickOutside = vi.fn();
    const modalClickOutside = vi.fn();
    const itemHotkey = vi.fn();

    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: [] }} />
        <Slot
          slot="item"
          config={{ id: "i1", hotkeys: ["Delete"], onHotkey: itemHotkey, onClickOutside: itemClickOutside }}
        />
        <Slot
          slot="modal"
          config={{ id: "m1", hotkeys: [], onClickOutside: modalClickOutside, captureClickOutside: true }}
        />
      </Wrap>
    );
    mousedown(document.body);
    expect(modalClickOutside).toHaveBeenCalledTimes(1);
    expect(itemClickOutside).not.toHaveBeenCalled();

    // Item should still be top slot and respond to hotkeys
    itemHotkey.mockClear();
    keydown("Delete");
    expect(itemHotkey).toHaveBeenCalledWith("Delete");
  });

  // 12. Keydown → only top-layer hotkey fires
  it("12: keydown dispatches only to top-layer hotkey handler", () => {
    const spreadFn = vi.fn();
    const itemFn = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: ["Delete"], onHotkey: spreadFn }} />
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey: itemFn }} />
      </Wrap>
    );
    keydown("Delete");
    expect(itemFn).toHaveBeenCalledWith("Delete");
    expect(spreadFn).not.toHaveBeenCalled();
  });

  // 13. Keydown in INPUT → skip (original check)
  it("13: keydown is skipped when active element is INPUT", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    try {
      input.focus();
      keydown("Delete");
      expect(onHotkey).not.toHaveBeenCalled();
    } finally {
      input.blur();
      input.remove();
    }
  });

  // 14. Keydown in SELECT → skip (Phase 01 extension)
  it("14: keydown is skipped when active element is SELECT", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    const select = document.createElement("select");
    document.body.appendChild(select);
    try {
      select.focus();
      keydown("Delete");
      expect(onHotkey).not.toHaveBeenCalled();
    } finally {
      select.blur();
      select.remove();
    }
  });

  // 15. Keydown in role="combobox" → skip (Phase 01 ARIA extension)
  it("15: keydown is skipped when active element has role=combobox", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    const combobox = document.createElement("div");
    combobox.setAttribute("role", "combobox");
    combobox.setAttribute("tabindex", "0");
    document.body.appendChild(combobox);
    try {
      combobox.focus();
      keydown("Delete");
      expect(onHotkey).not.toHaveBeenCalled();
    } finally {
      combobox.blur();
      combobox.remove();
    }
  });

  // 16. Key not in hotkeys list → no call
  it("16: key not registered in hotkeys list does not fire onHotkey", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Escape"], onHotkey }} />
      </Wrap>
    );
    keydown("Delete"); // not in hotkeys
    expect(onHotkey).not.toHaveBeenCalled();
  });

  // 17. Layer without onClickOutside → remain registered after click outside
  it("17: layer without onClickOutside stays registered on click outside", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="spread" config={{ id: "s1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    mousedown(document.body); // click outside, no onClickOutside → spread not popped
    keydown("Delete");
    expect(onHotkey).toHaveBeenCalledWith("Delete");
  });

  // 18. Escape bypasses editable element guard → modal can close from inside textarea
  it("18: Escape bypasses editable element guard (modal closes from inside TEXTAREA)", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="modal" config={{ id: "m1", hotkeys: ["Escape", "Delete"], onHotkey }} />
      </Wrap>
    );
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    try {
      textarea.focus();
      // Escape should pass through even when focus is in TEXTAREA
      keydown("Escape");
      expect(onHotkey).toHaveBeenCalledWith("Escape");

      // But Delete should still be blocked when focus is in TEXTAREA
      onHotkey.mockClear();
      keydown("Delete");
      expect(onHotkey).not.toHaveBeenCalled();
    } finally {
      textarea.blur();
      textarea.remove();
    }
  });

  // 19. role="textbox" without contentEditable → hotkeys MUST fire (canvas textbox
  // wrapper uses role=textbox for a11y but isn't actively editable until the
  // user enters edit mode via double-click, which toggles contentEditable).
  it("19: role=textbox without contentEditable does NOT block hotkeys", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    const wrapper = document.createElement("div");
    wrapper.setAttribute("role", "textbox");
    wrapper.setAttribute("aria-label", "Textbox 1");
    wrapper.setAttribute("tabindex", "0");
    document.body.appendChild(wrapper);
    try {
      wrapper.focus();
      keydown("Delete");
      expect(onHotkey).toHaveBeenCalledWith("Delete");
    } finally {
      wrapper.blur();
      wrapper.remove();
    }
  });

  // 20. contentEditable element → hotkeys blocked (covers the "textbox actively
  // being edited" case — wrapper now has contentEditable=true).
  it("20: contentEditable element blocks hotkeys (actively editing rich text)", () => {
    const onHotkey = vi.fn();
    render(
      <Wrap>
        <Slot slot="item" config={{ id: "i1", hotkeys: ["Delete"], onHotkey }} />
      </Wrap>
    );
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.setAttribute("tabindex", "0");
    // jsdom quirk: isContentEditable getter is not reliable, stub it
    Object.defineProperty(editable, "isContentEditable", {
      value: true,
      configurable: true,
    });
    document.body.appendChild(editable);
    try {
      editable.focus();
      keydown("Delete");
      expect(onHotkey).not.toHaveBeenCalled();
    } finally {
      editable.blur();
      editable.remove();
    }
  });
});
