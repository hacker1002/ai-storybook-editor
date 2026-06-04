// video-worker/src/webpack-override.ts
// Reconciles the Vite-authored composition graph with Remotion's webpack bundler:
//   1. alias `@` → frontend src (composition + editor builders use `@/...`)
//   2. WASM `?url` imports: Vite-only query semantics, made to work under webpack.
//   3. catch-all for the remaining Vite resource queries (?url/?raw/?worker on non-wasm
//      assets) so a stray import degrades to an asset instead of crashing the build.
//
// Lottie engine WASM resolution (see src/remotion/lottie/thorvg-lottie-player.tsx):
//   The adapter imports `@lottiefiles/dotlottie-web/dotlottie-player.wasm?url` — the SAME
//   bundled-asset strategy the editor's dot-lottie-player.tsx uses, so the worker no longer
//   pins the WASM to a hardcoded worker origin (and the browser/demo path no longer breaks
//   on a loopback URL pointing at the end user's machine).
//
//   Vite strips the `?url` query before matching the package `exports` field; webpack does
//   NOT — it tries to resolve `…/dotlottie-player.wasm?url` against `exports`, which only
//   lists the bare `./dotlottie-player.wasm` key → "not exported" build failure. So we:
//     (a) strip `?url` from any `*.wasm?url` request (NormalModuleReplacementPlugin) so the
//         bare subpath matches the exports key, then
//     (b) emit every resolved `.wasm` as `asset/resource` (a served URL) — bare `.wasm`
//         imports have no `?url` query left for the catch-all rule to match.
//   The headless Chromium then fetches the WASM from the Remotion bundle origin at render
//   time (served by Remotion's own bundle server), no worker static route involved.

import webpack from "webpack";
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
    plugins: [
      ...(config.plugins ?? []),
      // (a) Strip `?url` from `*.wasm?url` so webpack's `exports`-field resolution matches
      //     the bare `./dotlottie-player.wasm` key (Vite strips it for us; webpack doesn't).
      new webpack.NormalModuleReplacementPlugin(/\.wasm\?url$/, (resource) => {
        resource.request = resource.request.replace(/\?url$/, "");
      }),
    ],
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        // (b) Resolved `.wasm` → served URL asset (overrides any default webassembly/async
        //     handling; appended last so this `type` wins). The engine fetches+instantiates
        //     it itself via DotLottie.setWasmUrl, so it must be a URL, not a wasm module.
        {
          test: /\.wasm$/,
          type: "asset/resource",
        },
        // Remaining Vite resource queries on non-wasm assets → emit as asset url.
        {
          resourceQuery: /(^|&)(url|raw|worker)(&|$)/,
          type: "asset/resource",
        },
      ],
    },
  };
};
