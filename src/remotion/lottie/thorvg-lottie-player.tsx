// remotion/lottie/thorvg-lottie-player.tsx
// Frame-deterministic .lottie renderer driven by the SAME engine the editor preview uses
// (@lottiefiles/dotlottie-web → ThorVG). Replaces the @remotion/lottie (lottie-web) path,
// which dropped dotLottie v2 theme / state-machine / embedded fonts → broke preview===output.
//
// How determinism is achieved (ThorVG paints ASYNCHRONOUSLY via WASM, unlike lottie-web's
// synchronous paint):
//   1. setWasmUrl() once at module load — WASM resolved via a `?url` import (see below).
//   2. autoplay:false + freeze() strips the engine's internal rAF clock.
//   3. Each Remotion frame: delayRender → setFrame(mappedFrame) → continueRender only after
//      the instance's 'render' event fires → guarantees the canvas holds THIS frame's pixels
//      before Remotion screenshots it (else: stale previous frame = determinism bug #1).
//
// Signature mirrors the editor's DotLottiePlayerProps so the consumer swap is transparent.

import { useCallback, useEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame } from "remotion";
import { DotLottie } from "@lottiefiles/dotlottie-web";
// WASM resolved as a bundled asset (same strategy as the editor's dot-lottie-player.tsx),
// portable across BOTH realms this module loads in:
//   - Browser (demo <Player> on Vercel): Vite emits a hashed asset served SAME-ORIGIN.
//   - Worker render bundle (headless Chromium): the webpack catch-all `?url` rule in
//     video-worker/src/webpack-override.ts maps this to `asset/resource`, served from the
//     Remotion bundle origin at render time.
// Removes the prior hardcoded `http://127.0.0.1:4000/...` literal which broke in the browser
// (loopback = the END USER's machine on Vercel) and pinned the adapter to the worker origin.
import wasmUrl from "@lottiefiles/dotlottie-web/dotlottie-player.wasm?url";
import { createLogger } from "@/utils/logger";
import { VIDEO_FPS } from "@/remotion/composition-metadata";
import { mapFrameToLottie } from "./thorvg-frame-mapping";

const log = createLogger("Remotion", "ThorVGLottiePlayer");

// NOTE: setWasmUrl is a GLOBAL static on the shared DotLottie class (last writer wins). Now
// that BOTH adapters (this one + the editor's dot-lottie-player.tsx) register a bundled
// `?url` WASM, a same-realm co-load resolves to byte-identical engines — but they still must
// not be co-loaded with divergent versions. Safe today: the worker render bundle and the
// demo <Player> graph each contain only THIS module.
DotLottie.setWasmUrl(wasmUrl);
log.debug("module", "registered ThorVG WASM url", { wasmUrl });

export interface DotLottiePlayerProps {
  src: string;
  isThumbnail?: boolean;
  options?: {
    theme?: string;
    state_machine?: string;
    speed?: number;
  };
  onLoad?: () => void;
  onError?: () => void;
}

export function DotLottiePlayer({ src, options, onLoad, onError }: DotLottiePlayerProps) {
  const frame = useCurrentFrame();

  const instanceRef = useRef<DotLottie | null>(null);
  const nativeFpsRef = useRef(0);
  const totalFramesRef = useRef(0);
  // Last dotLottie frame actually painted on this instance's canvas. ThorVG dedups a
  // setFrame() to an unchanged frame (no repaint → no 'render' event), so re-seeking the
  // same value would hang the per-frame gate forever (observed on frame 0 after load). We
  // track it to settle no-op seeks immediately — the canvas already holds those pixels.
  const lastPaintedRef = useRef<number | null>(null);
  // Whether loadHandle has been released. Guards the case where the canvas is re-created
  // (deps change) and the old instance is destroyed BEFORE it ever emits 'load'/'loadError'
  // — without this the load gate would orphan and stall the render to the 120s timeout.
  const loadSettledRef = useRef(false);
  // Frame 0 is held until the animation loads (mirrors the editor registering WASM before
  // any paint). useState initializer → render-safe, single handle, no ref-in-render.
  const [loadHandle] = useState(() => delayRender(`thorvg-load:${src}`));
  const [isLoaded, setIsLoaded] = useState(false);

  const speed = options?.speed ?? 1;
  const themeId = options?.theme;
  const stateMachineId = options?.state_machine;

  // Canvas callback ref: create the raw DotLottie instance (NOT the React wrapper — that's
  // rAF/autoplay-driven and useless under render). null → unmount → destroy.
  const canvasRefCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) {
        log.debug("canvasRef", "unmount — destroying instance", { src });
        instanceRef.current?.destroy();
        instanceRef.current = null;
        // Old instance destroyed before it loaded → release the orphaned load gate so the
        // render isn't stalled to the timeout (the new instance creates its own gate state).
        if (!loadSettledRef.current) {
          continueRender(loadHandle);
          loadSettledRef.current = true;
        }
        return;
      }

      const instance = new DotLottie({
        canvas,
        src,
        autoplay: false,
        loop: true,
        themeId,
        stateMachineId,
        useFrameInterpolation: true,
        renderConfig: { autoResize: true, devicePixelRatio: 1 },
      });
      instance.setUseFrameInterpolation(true);
      instance.freeze(); // strip the internal rAF clock — frames driven solely by setFrame
      instanceRef.current = instance;

      instance.addEventListener("load", () => {
        const totalFrames = instance.totalFrames;
        const duration = instance.duration;
        nativeFpsRef.current = duration > 0 ? totalFrames / duration : 0;
        totalFramesRef.current = totalFrames;
        // Paint frame 0 now (autoplay:false leaves the canvas blank until the first seek —
        // same reason the editor thumbnail calls setFrame(0) on load). This is the first-ever
        // seek so it always paints, and it primes lastPaintedRef so the per-frame effect's
        // frame-0 seek is correctly recognised as a no-op.
        instance.setFrame(0);
        lastPaintedRef.current = 0;
        log.info("load", "ThorVG animation loaded", {
          src,
          totalFrames,
          nativeFps: nativeFpsRef.current,
        });
        onLoad?.();
        // Async event callback (not a synchronous effect body) → allowed under React 19.
        setIsLoaded(true);
        loadSettledRef.current = true;
        continueRender(loadHandle);
      });

      instance.addEventListener("loadError", () => {
        log.warn("loadError", "ThorVG animation failed to load", { src });
        onError?.();
        loadSettledRef.current = true;
        continueRender(loadHandle); // never block the whole render on one broken asset
      });
    },
    [src, themeId, stateMachineId, onLoad, onError, loadHandle],
  );

  // Per-frame gate: seek to the mapped frame and hold the screenshot until ThorVG paints it.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!isLoaded || !instance) return;

    const lottieFrame = mapFrameToLottie(
      frame,
      VIDEO_FPS,
      nativeFpsRef.current,
      totalFramesRef.current,
      speed,
    );

    // No-op seek: the canvas already holds this exact frame (frame 0 after the load paint,
    // or a static spread). Re-seeking dedups → no 'render' → would hang. Settle now.
    const prev = lastPaintedRef.current;
    if (prev !== null && Math.abs(prev - lottieFrame) < 1e-6) {
      log.debug("frame", "no-op seek (canvas current)", { src, frame, lottieFrame });
      return;
    }

    const handle = delayRender(`thorvg-frame:${frame}`);
    let settled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (fallback) clearTimeout(fallback);
      instance.removeEventListener("render", onRender);
      continueRender(handle);
    };
    const onRender = () => {
      lastPaintedRef.current = lottieFrame;
      settle();
    };
    instance.addEventListener("render", onRender);

    try {
      log.debug("frame", "seek", { src, frame, lottieFrame });
      instance.setFrame(lottieFrame);
      // Defensive: if ThorVG never emits 'render' for this seek, don't hang the render to the
      // 120s timeout — settle after a bounded wait. This only fires on a dedup we didn't
      // predict via lastPaintedRef (no paint happened → the canvas still holds the prior,
      // identical frame → the screenshot is correct). The margin is well under the 120s
      // render timeout yet far above a real single-frame paint (sub-ms..low-ms) + interpolation
      // ON makes fractional seeks distinct rasters that DO emit 'render' — so in practice this
      // path is dead for normal assets (observed: 0 fallbacks across the parity render).
      fallback = setTimeout(() => {
        log.warn("frame", "render event missing — settling via fallback", { src, frame, lottieFrame });
        lastPaintedRef.current = lottieFrame;
        settle();
      }, 30_000);
    } catch (err) {
      log.error("frame", "ThorVG setFrame failed", { src, frame, error: String(err) });
      settle();
    }

    // Release the handle if the frame changes / component unmounts before 'render' fires —
    // a hung handle would stall the render until the 120s timeout.
    return () => settle();
  }, [frame, isLoaded, src, speed]);

  return (
    <canvas
      ref={canvasRefCallback}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default DotLottiePlayer;
