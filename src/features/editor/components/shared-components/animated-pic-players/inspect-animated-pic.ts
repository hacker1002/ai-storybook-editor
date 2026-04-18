// inspect-animated-pic.ts — off-screen probe to read intrinsic dimensions AND
// metadata (state machines, artboards, animations, themes) from .lottie/.riv files.
// Powers: (a) geometry re-ratio on upload, (b) dropdown options in toolbar for
// configuring interactive playback, (c) auto-derive interactivity flag.
//
// Uses dynamic imports so WASM/runtime stays out of main bundle.

import { createLogger } from "@/utils/logger";
import type { SpreadAnimatedPic } from "@/types/spread-types";

const log = createLogger("Editor", "InspectAnimatedPic");
const PROBE_TIMEOUT_MS = 10000;

// === Interactivity derivation ===

/**
 * Interactive = state machine configured. Thumbnails always non-interactive
 * per product rule. Used by player-canvas to route pointer events directly to
 * the Rive/Lottie runtime canvas (bypassing narration click-loop).
 */
export function isAnimatedPicInteractive(
  pic: SpreadAnimatedPic,
  opts: { isThumbnail?: boolean } = {},
): boolean {
  if (opts.isThumbnail) return false;
  const url = pic.media_url?.toLowerCase().split("?")[0] ?? "";
  if (url.endsWith(".riv")) return !!pic.rive?.state_machine;
  if (url.endsWith(".lottie")) return !!pic.lottie?.state_machine;
  return false;
}

export interface LottieInspection {
  width: number;
  height: number;
  animations: string[];    // animation ids from manifest
  stateMachines: string[]; // state machine ids from manifest
  themes: string[];        // theme ids from manifest
}

export interface RiveInspection {
  width: number;
  height: number;
  artboards: string[];           // all artboard names
  activeArtboard: string | null; // currently loaded artboard
  stateMachines: string[];       // state machines for active artboard
  animations: string[];          // linear animations for active artboard
}

// Module-level cache keyed by URL — survives toolbar remounts within a session.
const lottieUrlCache = new Map<string, LottieInspection>();
const riveUrlCache = new Map<string, RiveInspection>();

// === Lottie ===

export async function inspectLottie(file: File): Promise<LottieInspection> {
  const buffer = await file.arrayBuffer();
  return inspectLottieBuffer(buffer);
}

export async function inspectLottieFromUrl(url: string): Promise<LottieInspection> {
  const cached = lottieUrlCache.get(url);
  if (cached) {
    log.debug("inspectLottieFromUrl", "cache hit", { url });
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch .lottie: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const result = await inspectLottieBuffer(buffer);
  lottieUrlCache.set(url, result);
  return result;
}

async function inspectLottieBuffer(buffer: ArrayBuffer): Promise<LottieInspection> {
  const { DotLottie } = await import("@lottiefiles/dotlottie-web");
  DotLottie.setWasmUrl("/wasm/dotlottie-player.wasm");

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  return new Promise((resolve, reject) => {
    let settled = false;
    const instance = new DotLottie({
      canvas,
      data: buffer,
      autoplay: false,
      loop: false,
    });

    const cleanup = () => { try { instance.destroy(); } catch { /* noop */ } };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      log.warn("inspectLottieBuffer", "probe timed out");
      reject(new Error("Lottie inspect probe timed out"));
    }, PROBE_TIMEOUT_MS);

    instance.addEventListener("load", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const { width, height } = instance.animationSize();
        const manifest = instance.manifest;
        const animations = manifest?.animations?.map((a) => a.id) ?? [];
        const stateMachines = manifest?.stateMachines?.map((s) => s.id) ?? [];
        const themes = manifest?.themes?.map((t) => t.id) ?? [];
        cleanup();
        if (!width || !height) {
          reject(new Error("Lottie reported zero dimensions"));
          return;
        }
        log.debug("inspectLottieBuffer", "success", {
          width, height,
          animationCount: animations.length,
          smCount: stateMachines.length,
          themeCount: themes.length,
        });
        resolve({ width, height, animations, stateMachines, themes });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    instance.addEventListener("loadError", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      log.warn("inspectLottieBuffer", "load error");
      reject(new Error("Lottie failed to load"));
    });
  });
}

// === Rive ===

export async function inspectRive(file: File): Promise<RiveInspection> {
  const buffer = await file.arrayBuffer();
  return inspectRiveBuffer(buffer);
}

export async function inspectRiveFromUrl(url: string): Promise<RiveInspection> {
  const cached = riveUrlCache.get(url);
  if (cached) {
    log.debug("inspectRiveFromUrl", "cache hit", { url });
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch .riv: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const result = await inspectRiveBuffer(buffer);
  riveUrlCache.set(url, result);
  return result;
}

async function inspectRiveBuffer(buffer: ArrayBuffer): Promise<RiveInspection> {
  const [{ Rive, RuntimeLoader }, { default: riveWasmUrl }] = await Promise.all([
    import("@rive-app/react-canvas"),
    import("@rive-app/canvas/rive.wasm?url"),
  ]);
  RuntimeLoader.setWasmUrl(riveWasmUrl);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { rive.cleanup(); } catch { /* noop */ }
      log.warn("inspectRiveBuffer", "probe timed out");
      reject(new Error("Rive inspect probe timed out"));
    }, PROBE_TIMEOUT_MS);

    const rive = new Rive({
      canvas,
      buffer,
      autoplay: false,
      onLoad: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const width = rive.artboardWidth;
          const height = rive.artboardHeight;
          const stateMachines = rive.stateMachineNames ?? [];
          const animations = rive.animationNames ?? [];
          const activeArtboard = rive.activeArtboard ?? null;
          // contents.artboards: Array<{name, stateMachines, animations}> — see @rive-app/canvas
          const contents = (rive as unknown as {
            contents?: { artboards?: Array<{ name: string }> };
          }).contents;
          const artboards = contents?.artboards?.map((a) => a.name) ?? [];
          rive.cleanup();
          if (!width || !height) {
            reject(new Error("Rive reported zero dimensions"));
            return;
          }
          log.debug("inspectRiveBuffer", "success", {
            width, height,
            artboardCount: artboards.length,
            smCount: stateMachines.length,
            animationCount: animations.length,
          });
          resolve({ width, height, artboards, activeArtboard, stateMachines, animations });
        } catch (err) {
          try { rive.cleanup(); } catch { /* noop */ }
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      onLoadError: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { rive.cleanup(); } catch { /* noop */ }
        log.warn("inspectRiveBuffer", "load error");
        reject(new Error("Rive failed to load"));
      },
    });
  });
}

// === Backward-compatible aliases for dimension-only callers ===

export async function detectLottieDimensions(file: File) {
  const { width, height } = await inspectLottie(file);
  return { width, height };
}

export async function detectRiveDimensions(file: File) {
  const { width, height } = await inspectRive(file);
  return { width, height };
}
