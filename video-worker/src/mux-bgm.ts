// video-worker/src/mux-bgm.ts
// BGM mux helper: post-concat ffmpeg pass that blends background music into the
// rendered book MP4 (design 06-book-render.md §8).
//
// Case A (comp has 0:a per-spread audio — default v1):
//   amix=inputs=2:duration=first:dropout_transition=0:normalize=0
//   BGM -stream_loop -1 + volume + atrim=duration=total_sec
//   -c:v copy -c:a aac -b:a 192k -movflags +faststart
//
// Case B (comp has no 0:a — BGM is the only audio track):
//   BGM -stream_loop -1 + volume + atrim=duration=total_sec
//   -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart
//
// Detection: ffprobe book-concat.mp4 → check for audio stream → choose Case.
// Both cases keep -c:v copy so only audio is re-encoded (fast, ~seconds).

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Agent } from "undici";
import { assertSsrfSafe, SsrfBlockedError } from "./ssrf-guard.js";
import { BGM_MAX_BYTES } from "./paths.js";

export const BGM_AUDIO_BITRATE = "192k";

export interface BgmInput {
  url: string;
  volume: number; // 0..2 (book.music.volume_scale)
}

export interface MuxBgmResult {
  outputPath: string;
  /** Human-readable reason when BGM was skipped (degrade path). */
  skippedReason?: string;
}

/**
 * Mux BGM into the concatenated book MP4.
 *
 * Always returns a result — if BGM fetch/SSRF/mux fails, `skippedReason` is set
 * and the output is the original concat file (renamed). NEVER throws (degrade only).
 *
 * @param concatPath  Path to book-concat.mp4 (will be consumed/renamed).
 * @param outputPath  Desired final output path (book-{ts}-{uuid8}.mp4).
 * @param bgm         BGM url + volume.
 * @param durationInFrames  Total book frames (for atrim= total_sec calculation).
 * @param fps         Composition fps.
 */
export async function muxBgm(
  concatPath: string,
  outputPath: string,
  bgm: BgmInput,
  durationInFrames: number,
  fps: number
): Promise<MuxBgmResult> {
  // ── 1. SSRF guard ────────────────────────────────────────────────────────
  // Returns the pre-validated resolved addresses; we pin the fetch to them
  // to prevent DNS-rebinding (a re-resolve at fetch time could yield a
  // different IP).
  let ssrfResult: { addresses: string[]; parsed: URL };
  try {
    ssrfResult = await assertSsrfSafe(bgm.url);
  } catch (err) {
    const reason = err instanceof SsrfBlockedError ? err.message : `ssrf_check_failed: ${String(err)}`;
    console.warn(`[mux-bgm] SSRF blocked, degrading — ${reason}`);
    await fs.rename(concatPath, outputPath);
    return { outputPath, skippedReason: reason };
  }

  // ── 2. Fetch BGM (capped at BGM_MAX_BYTES) ───────────────────────────────
  let bgmPath: string;
  try {
    bgmPath = await fetchBgmFile(bgm.url, ssrfResult);
  } catch (err) {
    const reason = `bgm_fetch_failed: ${String(err)}`;
    console.warn(`[mux-bgm] fetch failed, degrading — ${reason}`);
    await fs.rename(concatPath, outputPath);
    return { outputPath, skippedReason: reason };
  }

  // ── 3. Detect audio stream in concat file ────────────────────────────────
  let hasCompAudio: boolean;
  try {
    hasCompAudio = await detectAudioStream(concatPath);
  } catch (err) {
    console.warn(`[mux-bgm] ffprobe failed, degrading — ${String(err)}`);
    await cleanupFile(bgmPath);
    await fs.rename(concatPath, outputPath);
    return { outputPath, skippedReason: `ffprobe_failed: ${String(err)}` };
  }

  // ── 4. FFmpeg mux ────────────────────────────────────────────────────────
  const totalSec = durationInFrames / fps;
  const volume = Math.max(0, Math.min(2, bgm.volume ?? 1.0));

  try {
    await runFfmpegMux({ concatPath, bgmPath, outputPath, totalSec, volume, hasCompAudio });
  } catch (err) {
    console.warn(`[mux-bgm] ffmpeg mux failed, degrading — ${String(err)}`);
    await cleanupFile(bgmPath);
    // concat still exists if mux failed partway; rename it as output
    await fs.rename(concatPath, outputPath).catch(() => undefined);
    return { outputPath, skippedReason: `mux_failed: ${String(err)}` };
  }

  // ── 5. Cleanup intermediates ─────────────────────────────────────────────
  await cleanupFile(bgmPath);
  await cleanupFile(concatPath);

  return { outputPath };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the BGM file to a local temp path.
 *
 * SSRF-safe DNS-pinning (undici dispatcher):
 *   - The fetch URL keeps the ORIGINAL hostname → TLS SNI + certificate
 *     verification work normally (HTTPS CDNs serve a cert for the hostname, not
 *     the IP — connecting by raw IP would fail TLS validation).
 *   - A per-request undici `Agent` overrides `connect.lookup` to ALWAYS return
 *     the IP that `assertSsrfSafe` already resolved + validated. So the TCP
 *     connection lands on the validated IP (no second, attacker-controllable DNS
 *     resolution → closes the DNS-rebinding TOCTOU) while TLS still sees the host.
 *   - `redirect: "manual"` → 3xx is never auto-followed; a redirect could escape
 *     to an internal URL, so it's treated as a fetch failure → degrade (no render
 *     loss).
 */
async function fetchBgmFile(
  url: string,
  ssrfResult: { addresses: string[]; parsed: URL },
): Promise<string> {
  const { addresses } = ssrfResult;
  const pinnedIp = addresses[0]; // first validated address — pins the TCP connection
  const family = pinnedIp.includes(":") ? 6 : 4;

  // undici Agent whose lookup is hard-pinned to the validated IP. Fetch still
  // targets the original hostname (TLS-correct); the socket connects to pinnedIp.
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, cb) => {
        if (options && (options as { all?: boolean }).all) {
          (cb as unknown as (e: Error | null, a: { address: string; family: number }[]) => void)(
            null,
            [{ address: pinnedIp, family }],
          );
        } else {
          (cb as (e: Error | null, a: string, f: number) => void)(null, pinnedIp, family);
        }
      },
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s fetch timeout

  try {
    const init: RequestInit = { signal: controller.signal, redirect: "manual" };
    // `dispatcher` is an undici-specific fetch option not in the DOM RequestInit type.
    (init as unknown as { dispatcher: unknown }).dispatcher = dispatcher;

    const response = await fetch(url, init);

    // Treat any 3xx as a failure — redirects could escape the SSRF-validated IP.
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`BGM redirect (${response.status}) refused for SSRF safety`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching BGM`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > BGM_MAX_BYTES) {
      throw new Error(`BGM Content-Length ${contentLength} > cap ${BGM_MAX_BYTES}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("BGM response has no body");

    const tmpPath = path.join(os.tmpdir(), `bgm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.audio`);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > BGM_MAX_BYTES) {
        reader.cancel().catch(() => undefined);
        throw new Error(`BGM body exceeded cap ${BGM_MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }

    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    await fs.writeFile(tmpPath, buf);
    return tmpPath;
  } finally {
    clearTimeout(timeoutId);
    dispatcher.destroy().catch(() => undefined);
  }
}

async function detectAudioStream(videoPath: string): Promise<boolean> {
  const result = await runProcess("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_streams",
    videoPath,
  ]);
  const probe = JSON.parse(result) as { streams?: Array<{ codec_type?: string }> };
  return (probe.streams ?? []).some((s) => s.codec_type === "audio");
}

interface MuxParams {
  concatPath: string;
  bgmPath: string;
  outputPath: string;
  totalSec: number;
  volume: number;
  hasCompAudio: boolean;
}

async function runFfmpegMux(p: MuxParams): Promise<void> {
  const { concatPath, bgmPath, outputPath, totalSec, volume, hasCompAudio } = p;

  // Round to 3 decimal places to avoid ffmpeg filter precision issues
  const durationStr = totalSec.toFixed(3);
  const volumeStr = volume.toFixed(4);

  let args: string[];

  if (hasCompAudio) {
    // Case A: amix per-spread audio + BGM
    args = [
      "-i", concatPath,
      "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex",
      `[1:a]volume=${volumeStr},atrim=duration=${durationStr},asetpts=N/SR/TB[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", BGM_AUDIO_BITRATE,
      "-movflags", "+faststart",
      "-y", outputPath,
    ];
  } else {
    // Case B: BGM only (no comp audio stream)
    args = [
      "-i", concatPath,
      "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex",
      `[1:a]volume=${volumeStr},atrim=duration=${durationStr},asetpts=N/SR/TB[a]`,
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", BGM_AUDIO_BITRATE,
      "-shortest",
      "-movflags", "+faststart",
      "-y", outputPath,
    ];
  }

  console.log(`[mux-bgm] ffmpeg mux Case ${hasCompAudio ? "A" : "B"} totalSec=${durationStr} vol=${volumeStr}`);
  await runProcess("ffmpeg", args);
}

function runProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => stdout.push(d));
    proc.stderr.on("data", (d: Buffer) => stderr.push(d));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString());
      } else {
        const errText = Buffer.concat(stderr).toString().slice(-800);
        reject(new Error(`${cmd} exited ${code}: ${errText}`));
      }
    });
    proc.on("error", reject);
  });
}

async function cleanupFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => undefined);
}
