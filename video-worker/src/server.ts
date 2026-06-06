// video-worker/src/server.ts
// Render server exposing POST /render (1-spread) and POST /render-book (full-book).
// Output written locally and served via /files (static). Renders run one at a time
// (CPU/RAM bound); a small in-flight guard rejects concurrent requests (429 BUSY)
// rather than risk OOM. Dev-only: bound to localhost, permissive CORS.
//
// Security split (design 02 §6):
//   GET  /files/*       — public read-only (book artifacts must be internet-reachable)
//   POST /render*       — token-protected (VIDEO_WORKER_TOKEN, env-gated)
//   GET  /health        — public (liveness probe)
//
// Prune policy:
//   /render 1-spread     → prune spread-* only, keep 10 most-recent
//   /render-book         → NEVER prune (book files are durable artifacts)

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import { OUT_DIR, WORKER_PORT, VIDEO_WORKER_TOKEN } from "./paths.js";
import {
  renderSpread,
  warmup,
  SUPPORTED_LANGUAGES,
  type RenderInput,
  type RenderLanguage,
} from "./render.js";
import { renderBook, type BookRenderInput } from "./render-book.js";
import { classifyRenderError, ERROR_STATUS } from "./errors.js";
import type { BgmInput } from "./mux-bgm.js";

/** Narrow an arbitrary body value to a supported language, defaulting to en_US. */
function coerceLanguage(value: unknown): RenderLanguage {
  return SUPPORTED_LANGUAGES.includes(value as RenderLanguage)
    ? (value as RenderLanguage)
    : "en_US";
}

const PORT = WORKER_PORT;
const MAX_KEEP_SPREAD_FILES = 10;

const app = express();
app.use(express.json({ limit: "30mb" }));

// ── Dev CORS (demo runs on a different Vite port) ────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Worker-Token");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Static file serving (public — book artifacts must be internet-reachable) ─
app.use("/files", express.static(OUT_DIR));

// NOTE: the worker no longer serves the ThorVG WASM. The render adapter resolves it as a
// bundled `?url` asset (src/remotion/lottie/thorvg-lottie-player.tsx + webpack-override.ts),
// so the headless Chromium fetches it from the Remotion bundle origin — origin-independent,
// nothing to host here. Only `/files` (MP4) + `/health` are exposed publicly.

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ── Token middleware for POST /render* routes ────────────────────────────────
// VIDEO_WORKER_TOKEN unset → bypass (dev loopback). Set → require X-Worker-Token match.
function requireToken(req: Request, res: Response, next: NextFunction): void {
  if (!VIDEO_WORKER_TOKEN) {
    // Dev loopback: no token configured — bypass.
    next();
    return;
  }
  const provided = req.headers["x-worker-token"];
  if (provided !== VIDEO_WORKER_TOKEN) {
    res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "Missing or invalid X-Worker-Token" });
    return;
  }
  next();
}

// ── Shared in-flight guard ────────────────────────────────────────────────────
// Both /render and /render-book share this flag (1 render slot, CPU/RAM bound).
let rendering = false;

// ── POST /render — 1-spread render ───────────────────────────────────────────
app.post("/render", requireToken, async (req: Request, res: Response) => {
  const { spread, language, dimension, bleedMm } = req.body ?? {};
  if (!spread || typeof spread !== "object") {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "`spread` object required" });
    return;
  }
  if (rendering) {
    res.status(429).json({ ok: false, code: "BUSY", message: "another render in progress" });
    return;
  }

  const input: RenderInput = {
    spread,
    language: coerceLanguage(language),
    // Forward book sizing → composition derives the design-canvas width (font parity).
    // Absent (demo) → composition 800×600 fallback.
    ...(Number.isFinite(dimension) ? { dimension } : {}),
    ...(Number.isFinite(bleedMm) && bleedMm > 0 ? { bleedMm } : {}),
  };
  const fileName = `spread-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
  rendering = true;
  const start = Date.now();
  console.log(`[render] start ${fileName} lang=${input.language}`);

  try {
    const result = await renderSpread(input, fileName);
    await pruneSpreadFiles();
    const elapsedMs = Date.now() - start;
    console.log(`[render] done ${fileName} frames=${result.durationInFrames} ${elapsedMs}ms`);
    res.json({
      ok: true,
      url: `/files/${fileName}`,
      fileName,
      width: result.width,
      height: result.height,
      fps: result.fps,
      durationInFrames: result.durationInFrames,
      elapsedMs,
    });
  } catch (err) {
    const c = classifyRenderError(err);
    console.error(`[render] failed ${fileName} code=${c.code}: ${c.message}`);
    res.status(c.status).json({ ok: false, code: c.code, message: c.message });
  } finally {
    rendering = false;
  }
});

// ── POST /render-book — full-book chunked render ──────────────────────────────
app.post("/render-book", requireToken, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const {
    illustration,
    edition,
    language,
    startSpreadId,
    bgm,
    dimension,
    bleedMm,
    transitionSfxUrl,
  } = body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!illustration || typeof illustration !== "object") {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "`illustration` object required" });
    return;
  }
  if (edition !== "classic" && edition !== "dynamic") {
    res.status(400).json({
      ok: false,
      code: "INVALID_INPUT",
      message: `\`edition\` must be "classic" or "dynamic" (got: ${String(edition)})`,
    });
    return;
  }
  if (rendering) {
    res.status(429).json({ ok: false, code: "BUSY", message: "another render in progress" });
    return;
  }

  // Extract spreads/sections from illustration object
  const illus = illustration as Record<string, unknown>;
  const spreads = Array.isArray(illus.spreads) ? illus.spreads : [];
  const sections = Array.isArray(illus.sections) ? illus.sections : [];

  if (spreads.length === 0) {
    res.status(422).json({ ok: false, code: "EMPTY_SEQUENCE", message: "illustration.spreads is empty" });
    return;
  }

  // Validate and sanitize bgm (optional)
  let bgmInput: BgmInput | null = null;
  if (bgm && typeof bgm === "object") {
    const bgmObj = bgm as Record<string, unknown>;
    if (typeof bgmObj.url === "string" && bgmObj.url) {
      bgmInput = {
        url: bgmObj.url,
        volume: typeof bgmObj.volume === "number" ? Math.max(0, Math.min(2, bgmObj.volume)) : 1.0,
      };
    }
  }

  const fileName = `book-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
  rendering = true;
  const start = Date.now();
  console.log(`[render-book] start ${fileName} edition=${edition} spreads=${spreads.length}${bgmInput ? " bgm=yes" : ""}`);

  const input: BookRenderInput = {
    spreads,
    sections,
    edition,
    language: coerceLanguage(language),
    startSpreadId: typeof startSpreadId === "string" ? startSpreadId : undefined,
    bgm: bgmInput,
    // Book sizing → composition derives the design-canvas width (font/border parity).
    // Job 07 always supplies these; absent → composition 800×600 fallback.
    ...(Number.isFinite(dimension) ? { dimension } : {}),
    ...(Number.isFinite(bleedMm) && bleedMm > 0 ? { bleedMm } : {}),
    // Page-turn SFX (book.sound.transition_id resolved upstream). Only forward non-empty strings.
    ...(typeof transitionSfxUrl === "string" && transitionSfxUrl ? { transitionSfxUrl } : {}),
  };

  try {
    const result = await renderBook(input, fileName);
    // Book files are NEVER pruned (durable artifacts).
    const elapsedMs = Date.now() - start;
    console.log(`[render-book] done ${fileName} frames=${result.durationInFrames} spreads=${result.spreadsRendered} ${elapsedMs}ms`);

    res.json({
      ok: true,
      publicUrl: result.publicUrl,
      fileName: result.fileName,
      width: result.width,
      height: result.height,
      fps: result.fps,
      durationInFrames: result.durationInFrames,
      spreadsRendered: result.spreadsRendered,
      truncatedByCycle: result.truncatedByCycle,
      truncatedByCap: result.truncatedByCap,
      warnings: result.warnings,
      elapsedMs,
    });
  } catch (err) {
    // Check for known domain errors thrown by renderBook — use ERROR_STATUS map (DRY).
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EMPTY_SEQUENCE" || msg === "BOOK_TOO_LARGE") {
      const code = msg as "EMPTY_SEQUENCE" | "BOOK_TOO_LARGE";
      const status = ERROR_STATUS[code];
      res.status(status).json({ ok: false, code, message: err instanceof Error ? err.message : msg });
    } else {
      const c = classifyRenderError(err);
      console.error(`[render-book] failed ${fileName} code=${c.code}: ${c.message}`);
      res.status(c.status).json({ ok: false, code: c.code, message: c.message });
    }
  } finally {
    rendering = false;
  }
});

// ── Prune helpers ─────────────────────────────────────────────────────────────

/** Keep only the most-recent MAX_KEEP_SPREAD_FILES spread-* MP4s (ephemeral preview). */
async function pruneSpreadFiles(): Promise<void> {
  try {
    const entries = await fs.readdir(OUT_DIR);
    // Only prune `spread-` prefixed files; book- files are durable (never pruned).
    const spreadMp4s = entries.filter((f) => f.startsWith("spread-") && f.endsWith(".mp4")).sort();
    const excess = spreadMp4s.slice(0, Math.max(0, spreadMp4s.length - MAX_KEEP_SPREAD_FILES));
    await Promise.all(excess.map((f) => fs.unlink(path.join(OUT_DIR, f)).catch(() => undefined)));
  } catch {
    /* best-effort cleanup */
  }
}

async function main() {
  console.log("[server] warming up (browser + bundle)...");
  await warmup();
  // Bind loopback only — enforces the dev-only posture (no auth, wildcard CORS).
  app.listen(PORT, "127.0.0.1", () => console.log(`[server] ready on http://localhost:${PORT}`));
}

void main();
