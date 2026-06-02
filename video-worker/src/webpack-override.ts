// video-worker/src/webpack-override.ts
// Reconciles the Vite-authored composition graph with Remotion's webpack bundler:
//   1. alias `@` → frontend src (composition + editor builders use `@/...`)
//   2. catch-all for Vite resource queries (?url/?raw/?worker) so a stray import
//      degrades to an asset instead of crashing the build.
// (No lottie module swap needed: spike's spread-item-layer imports the deterministic
//  @remotion/lottie player directly, so the editor's `?url`-WASM player is never in this
//  graph. The catch-all rule below remains as defense-in-depth.)

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
