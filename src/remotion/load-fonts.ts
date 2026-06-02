// remotion/load-fonts.ts
// Registers Nunito (Validation S1: chosen font family) for the render/preview bundle.
// @remotion/google-fonts' loadFont() injects @font-face AND internally gates frame 0
// via delayRender/continueRender — so Chromium has the real glyphs before capture
// (no Times fallback). Imported as a side-effect from the entry; also importable by the
// demo page so <Player> preview matches the rendered output.

import { loadFont } from "@remotion/google-fonts/Nunito";

// Load only the weights/subsets actually used by spreads — bare loadFont() pulls every
// weight × subset (~40–80 requests). Spread typography uses Nunito 400 (regular); 700
// covers bold/read-along emphasis. Subsets: latin (+ -ext for accents) and vietnamese
// (demo supports vi_VN). Keeps it to a handful of requests + a fast frame-0 gate.
const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "latin-ext", "vietnamese"],
});

/** Resolved CSS font-family string for Nunito (e.g. "'Nunito', sans-serif"). */
export const NUNITO_FONT_FAMILY = fontFamily;
