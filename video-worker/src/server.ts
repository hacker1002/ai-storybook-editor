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

import os from "node:os";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import {
  OUT_DIR,
  WORKER_PORT,
  VIDEO_WORKER_TOKEN,
  TRANSCODE_SRC_MAX_BYTES,
  tierOutDir,
  MASTER_TIER,
} from "./paths.js";
import {
  renderSpread,
  warmup,
  SUPPORTED_LANGUAGES,
  type RenderInput,
  type RenderLanguage,
} from "./render.js";
import { renderBook, type BookRenderInput } from "./render-book.js";
import { classifyRenderError, classifyTranscodeError, ERROR_STATUS } from "./errors.js";
import {
  transcodeDownscale,
  TRANSCODE_TARGETS,
  type TranscodeTarget,
} from "./transcode.js";
import { probeEncoder, getEncoderProfile } from "./encoder-probe.js";
import { assertSsrfSafe } from "./ssrf-guard.js";
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

// ── POST /transcode — downscale QHD master → fhd/hd/sd (design 08) ────────────
app.post("/transcode", requireToken, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const sourceFileNameRaw = typeof body.sourceFileName === "string" ? body.sourceFileName.trim() : "";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const targetsRaw = Array.isArray(body.targets) ? body.targets : null;

  // ── Validate targets (non-empty, subset {fhd,hd,sd}, dedup, reject qhd) ────
  if (!targetsRaw || targetsRaw.length === 0) {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "`targets` non-empty array required" });
    return;
  }
  const seen = new Set<string>();
  const targets: TranscodeTarget[] = [];
  for (const t of targetsRaw) {
    if (typeof t !== "string" || !TRANSCODE_TARGETS.includes(t as TranscodeTarget)) {
      res.status(400).json({
        ok: false, code: "INVALID_INPUT",
        message: `\`targets\` must be a subset of [${TRANSCODE_TARGETS.join(",")}] (got: ${String(t)})`,
      });
      return;
    }
    if (!seen.has(t)) {
      seen.add(t);
      targets.push(t as TranscodeTarget);
    }
  }
  if (!sourceFileNameRaw && !sourceUrl) {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "one of `sourceFileName` or `sourceUrl` required" });
    return;
  }
  // Path-traversal guard: sourceFileName must be a bare basename.
  if (sourceFileNameRaw && (sourceFileNameRaw.includes("/") || sourceFileNameRaw.includes("\\") || sourceFileNameRaw.includes(".."))) {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", message: "`sourceFileName` must be a basename (no path separators)" });
    return;
  }

  if (rendering) {
    res.status(429).json({ ok: false, code: "BUSY", message: "another render in progress" });
    return;
  }
  rendering = true;
  const start = Date.now();

  // Resolve the master: local OUT_DIR file (primary) or SSRF-guarded fetch (fallback).
  let masterPath = "";
  let tempPath: string | null = null;
  // Output naming base: prefer sourceFileName, else derive from the URL path.
  let baseName = sourceFileNameRaw;

  try {
    if (sourceFileNameRaw) {
      // The QHD master is filed under out/qhd (render-book output tier).
      const localPath = path.join(tierOutDir(MASTER_TIER), path.basename(sourceFileNameRaw));
      const exists = await fs.access(localPath).then(() => true).catch(() => false);
      if (exists) {
        masterPath = localPath;
      } else if (!sourceUrl) {
        res.status(404).json({ ok: false, code: "SOURCE_NOT_FOUND", message: "source file not found in OUT_DIR" });
        return;
      }
    }
    if (!masterPath) {
      // sourceUrl fallback (future split-worker). SSRF-guarded + size-capped.
      if (!sourceUrl) {
        res.status(404).json({ ok: false, code: "SOURCE_NOT_FOUND", message: "source file not found in OUT_DIR" });
        return;
      }
      try {
        tempPath = await fetchMasterToTemp(sourceUrl);
        masterPath = tempPath;
        if (!baseName) baseName = path.basename(new URL(sourceUrl).pathname) || `master-${randomUUID().slice(0, 8)}.mp4`;
      } catch (err) {
        console.error(`[transcode] source fetch failed: ${String(err).slice(0, 200)}`);
        res.status(502).json({ ok: false, code: "SOURCE_FETCH_FAILED", message: "failed to fetch sourceUrl" });
        return;
      }
    }

    const profile = getEncoderProfile();
    console.log(`[transcode] start base=${baseName} targets=[${targets.join(",")}] encoder=${profile.name}`);

    const result = await transcodeDownscale(masterPath, baseName, targets, profile);
    const elapsedMs = Date.now() - start;
    console.log(
      `[transcode] done encoder=${profile.name} ${elapsedMs}ms ` +
      `perRes=[${result.outputs.map((o) => `${o.resolution}:${o.fileSizeBytes}`).join(",")}]`
    );

    res.json({
      ok: true,
      outputs: result.outputs,
      fps: result.fps,
      durationInFrames: result.durationInFrames,
      elapsedMs,
    });
  } catch (err) {
    const c = classifyTranscodeError(err);
    console.error(`[transcode] failed code=${c.code}: ${c.message.slice(0, 200)}`);
    res.status(c.status).json({ ok: false, code: c.code, message: c.message });
  } finally {
    if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
    rendering = false;
  }
});

/** Fetch `sourceUrl` (SSRF-guarded, size-capped) to a temp file. Throws on any
 *  failure (caller maps to 502 SOURCE_FETCH_FAILED). */
async function fetchMasterToTemp(sourceUrl: string): Promise<string> {
  await assertSsrfSafe(sourceUrl);
  const resp = await fetch(sourceUrl);
  if (!resp.ok || !resp.body) {
    throw new Error(`fetch returned ${resp.status}`);
  }
  const cl = Number(resp.headers.get("content-length") ?? 0);
  if (cl && cl > TRANSCODE_SRC_MAX_BYTES) {
    throw new Error(`source exceeds cap (${cl} > ${TRANSCODE_SRC_MAX_BYTES})`);
  }
  const tmp = path.join(os.tmpdir(), `transcode-src-${randomUUID().slice(0, 8)}.mp4`);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength > TRANSCODE_SRC_MAX_BYTES) {
    throw new Error(`source exceeds cap (${buf.byteLength} > ${TRANSCODE_SRC_MAX_BYTES})`);
  }
  await fs.writeFile(tmp, buf);
  return tmp;
}

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
  // Probe the transcode encoder once (nvenc→qsv→cpu) and cache (design 08 §3.1).
  await probeEncoder();
  // Bind loopback only — enforces the dev-only posture (no auth, wildcard CORS).
  app.listen(PORT, "127.0.0.1", () => console.log(`[server] ready on http://localhost:${PORT}`));
}

void main();
