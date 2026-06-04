// video-worker/src/webpack-override.ts
// Reconciles the Vite-authored composition graph with Remotion's webpack bundler:
//   1. alias `@` → frontend src (composition + editor builders use `@/...`)
//   2. catch-all for Vite resource queries (?url/?raw/?worker) so a stray import
//      degrades to an asset instead of crashing the build.
// (Lottie engine: spread-item-layer imports the ThorVG adapter (thorvg-lottie-player),
//  which fetches the dotLottie WASM from the worker origin via a fixed URL — the WASM is
//  copied STATICALLY into video-worker/public/ (see ensure-wasm-asset.ts), NOT via Vite's
//  `?url` import, so no hashed-asset resolution is needed here. The catch-all `?url` rule
//  below remains as defense-in-depth for any stray editor import that still uses it.)

import type { WebpackOverrideFn } from "@remotion/bundler";
import { FRONTEND_SRC } from "./paths";

export const webpackOverride: WebpackOverrideFn = (config) => {
  return {
    ...config,
    // Disable webpack's persistent filesystem cache: it can serve a STALE bundle after
    // composition/fps edits (observed: a 60fps change rendered at 30fps until the cache
    // at node_modules/.cache/webpack was cleared). For a dev render worker that bundles
    // once per boot, always-fresh source beats a few seconds of cold-bundle time.
    cache: false,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "@": FRONTEND_SRC,
      },
    },
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        // Vite resource queries → emit as asset url (webpack has no `?url` semantics).
        {
          resourceQuery: /(^|&)(url|raw|worker)(&|$)/,
          type: "asset/resource",
        },
      ],
    },
  };
};
