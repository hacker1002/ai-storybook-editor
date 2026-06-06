// video-worker/src/encoder-probe.ts
// Boot-time hardware-encoder probe for POST /transcode (design 08 §3.1).
//
// Picks the h264 encoder profile once at warmup and caches it module-level.
// Order of preference: NVENC (NVIDIA) → QSV (Intel Quick Sync) → libx264 (CPU,
// always available). A GPU encoder is selected only if it is BOTH listed by
// `ffmpeg -encoders` AND survives a 1-frame test-encode (driver/runtime present).
//
// `TRANSCODE_HWACCEL` override (paths.ts): `auto` (default, probe) | `nvenc` |
// `qsv` | `cpu`. A forced GPU profile that fails its probe → warn + fall back to
// CPU (never crash the service — design §3.1).
//
// The pure helpers (`parseAvailableEncoders`, `buildEncoderProfile`) are unit-
// tested without spawning ffmpeg; only `probeEncoder()` touches the binary.

import { spawn } from "node:child_process";

import {
  TRANSCODE_HWACCEL,
  TRANSCODE_CRF,
  TRANSCODE_CQ,
  TRANSCODE_PRESET,
} from "./paths.js";

export type EncoderName = "nvenc" | "qsv" | "cpu";

export interface EncoderProfile {
  /** Selected profile name (logged so ops can see which hardware was chosen). */
  name: EncoderName;
  /** ffmpeg `-c:v` value. */
  venc: string;
  /** Scale filter name — `scale` (CPU) / `scale_cuda` / `scale_qsv`. */
  scaleFilter: string;
  /** Suffix appended after `=W:H` (CPU lanczos flag; empty for GPU). */
  scaleSuffix: string;
  /** Input-level hwaccel args (before `-i`). Empty for CPU. */
  hwaccelIn: string[];
  /** Per-output encoder option args (quality/preset). */
  encOpts: string[];
  /** `-pix_fmt` value, or null to omit. CPU → yuv420p (broad web/mobile compat).
   *  GPU (nvenc/qsv) → null: with `-hwaccel_output_format cuda`/qsv the filtergraph
   *  emits hardware frames that the hw encoder consumes directly; forcing
   *  `-pix_fmt yuv420p` there needs an explicit hwdownload and otherwise errors
   *  ("Impossible to convert between the formats") — defeating the GPU path. */
  pixFmt: string | null;
}

/** Build the static profile for a given encoder name (pure — no probing). */
export function buildEncoderProfile(name: EncoderName): EncoderProfile {
  if (name === "nvenc") {
    return {
      name,
      venc: "h264_nvenc",
      scaleFilter: "scale_cuda",
      scaleSuffix: "",
      hwaccelIn: ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
      encOpts: ["-preset", "p5", "-tune", "hq", "-cq", String(TRANSCODE_CQ)],
      pixFmt: null,
    };
  }
  if (name === "qsv") {
    return {
      name,
      venc: "h264_qsv",
      scaleFilter: "scale_qsv",
      scaleSuffix: "",
      hwaccelIn: ["-hwaccel", "qsv"],
      encOpts: ["-global_quality", String(TRANSCODE_CQ), "-preset", "medium"],
      pixFmt: null,
    };
  }
  return {
    name: "cpu",
    venc: "libx264",
    scaleFilter: "scale",
    scaleSuffix: ":flags=lanczos",
    hwaccelIn: [],
    encOpts: ["-preset", TRANSCODE_PRESET, "-crf", String(TRANSCODE_CRF)],
    pixFmt: "yuv420p",
  };
}

/** Parse `ffmpeg -hide_banner -encoders` stdout → which h264 hw-encoders are listed.
 *  Listing ≠ usable (needs the runtime test-encode), but absence = definitely not. */
export function parseAvailableEncoders(encodersOutput: string): {
  nvenc: boolean;
  qsv: boolean;
} {
  return {
    nvenc: /\bh264_nvenc\b/.test(encodersOutput),
    qsv: /\bh264_qsv\b/.test(encodersOutput),
  };
}

// ── ffmpeg probing (I/O) ──────────────────────────────────────────────────────

/** Run a process, resolve `{ code, stdout }`. Never rejects (probe is best-effort). */
function runProbe(cmd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolve({ code: 1, stdout: "" });
      return;
    }
    const out: Buffer[] = [];
    proc.stdout?.on("data", (d: Buffer) => out.push(d));
    proc.stderr?.on("data", () => undefined);
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString() }));
    proc.on("error", () => resolve({ code: 1, stdout: "" }));
  });
}

/** 1-frame test-encode with a hw encoder → true if exit 0 (driver/runtime present). */
async function testEncode(venc: string): Promise<boolean> {
  const { code } = await runProbe("ffmpeg", [
    "-hide_banner",
    "-f", "lavfi",
    "-i", "testsrc=duration=0.1:size=128x128:rate=1",
    "-frames:v", "1",
    "-c:v", venc,
    "-f", "null",
    "-",
  ]);
  return code === 0;
}

let _cached: EncoderProfile | null = null;

/** Probe once and cache. Honors `TRANSCODE_HWACCEL`; falls back to CPU on any
 *  failure (design §3.1). Logs the boot probe result (BẮT BUỘC). */
export async function probeEncoder(): Promise<EncoderProfile> {
  if (_cached) return _cached;

  const forced = ["nvenc", "qsv", "cpu"].includes(TRANSCODE_HWACCEL)
    ? (TRANSCODE_HWACCEL as EncoderName)
    : null;

  // List encoders once (skip the test-encode for any not even listed).
  const { stdout } = await runProbe("ffmpeg", ["-hide_banner", "-encoders"]);
  const listed = parseAvailableEncoders(stdout);
  const available: EncoderName[] = ["cpu"]; // libx264 always present

  let selected: EncoderName = "cpu";

  const order: EncoderName[] = forced && forced !== "cpu" ? [forced] : ["nvenc", "qsv"];

  if (forced !== "cpu") {
    for (const candidate of order) {
      const isListed = candidate === "nvenc" ? listed.nvenc : listed.qsv;
      if (!isListed) continue;
      const venc = candidate === "nvenc" ? "h264_nvenc" : "h264_qsv";
      // eslint-disable-next-line no-await-in-loop
      const ok = await testEncode(venc);
      if (ok) {
        available.push(candidate);
        if (selected === "cpu") selected = candidate;
        if (!forced) break; // auto: take the first working GPU encoder
      }
    }
  }

  if (forced && forced !== "cpu" && selected !== forced) {
    console.warn(
      `[transcode] forced encoder "${forced}" failed probe — falling back to cpu`
    );
    selected = "cpu";
  }

  _cached = buildEncoderProfile(selected);
  console.log(
    `[transcode] encoder probe available=[${available.join(",")}] selected=${selected} forced=${forced ?? "auto"}`
  );
  return _cached;
}

/** Return the cached profile, falling back to CPU if `probeEncoder` never ran. */
export function getEncoderProfile(): EncoderProfile {
  return _cached ?? buildEncoderProfile("cpu");
}

/** Test-only: reset the module cache. */
export function _resetEncoderProbeCache(): void {
  _cached = null;
}
