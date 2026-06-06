// Unit tests for transcode pure helpers (no ffmpeg/ffprobe spawn).
//
// `@/remotion/composition-metadata` is mocked to the spec downscale dims so the
// test is isolated from the heavy shared-frontend import chain AND asserts the
// exact spec §1 dims (fhd 1440×1080, hd 960×720, sd 640×480).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/remotion/composition-metadata", () => ({
  RESOLUTION_DIMS: {
    qhd: { width: 1920, height: 1440 },
    fhd: { width: 1440, height: 1080 },
    hd: { width: 960, height: 720 },
    sd: { width: 640, height: 480 },
  },
}));

import {
  outputFileName,
  buildFilterComplex,
  buildFfmpegArgs,
  parseFfprobe,
} from "./transcode.js";
import { buildEncoderProfile } from "./encoder-probe.js";

const CPU = buildEncoderProfile("cpu");

describe("outputFileName", () => {
  it("appends -{res} and strips .mp4", () => {
    expect(outputFileName("book-123-ab12cd34.mp4", "fhd")).toBe("book-123-ab12cd34-fhd.mp4");
    expect(outputFileName("book-123-ab12cd34.mp4", "sd")).toBe("book-123-ab12cd34-sd.mp4");
  });

  it("uses basename only (path-traversal-safe naming)", () => {
    expect(outputFileName("/abs/path/book-x.mp4", "hd")).toBe("book-x-hd.mp4");
  });

  it("is case-insensitive on the .mp4 suffix", () => {
    expect(outputFileName("BOOK.MP4", "fhd")).toBe("BOOK-fhd.mp4");
  });
});

describe("buildFilterComplex", () => {
  it("splits N branches and scales each to spec dims (cpu lanczos)", () => {
    const fc = buildFilterComplex(["fhd", "hd", "sd"], CPU);
    expect(fc).toContain("[0:v]split=3[v0][v1][v2]");
    expect(fc).toContain("[v0]scale=1440:1080:flags=lanczos[fhd]");
    expect(fc).toContain("[v1]scale=960:720:flags=lanczos[hd]");
    expect(fc).toContain("[v2]scale=640:480:flags=lanczos[sd]");
  });

  it("single target → split=1", () => {
    const fc = buildFilterComplex(["fhd"], CPU);
    expect(fc).toContain("split=1[v0]");
    expect(fc).toContain("[v0]scale=1440:1080:flags=lanczos[fhd]");
  });

  it("gpu profile uses scale_cuda with no lanczos suffix", () => {
    const fc = buildFilterComplex(["hd"], buildEncoderProfile("nvenc"));
    expect(fc).toContain("[v0]scale_cuda=960:720[hd]");
  });
});

describe("buildFfmpegArgs", () => {
  it("maps each output with audio copy + faststart + per-res out path", () => {
    const args = buildFfmpegArgs("/out/book-x.mp4", ["fhd", "sd"], CPU,
      (r) => `/out/book-x-${r}.mp4`);
    expect(args).toContain("-i");
    expect(args).toContain("/out/book-x.mp4");
    expect(args).toContain("-filter_complex");
    // per-output maps + codecs
    expect(args).toContain("[fhd]");
    expect(args).toContain("[sd]");
    expect(args.filter((a) => a === "0:a?").length).toBe(2);   // optional audio per output
    expect(args.filter((a) => a === "copy").length).toBe(2);   // -c:a copy per output
    expect(args).toContain("/out/book-x-fhd.mp4");
    expect(args).toContain("/out/book-x-sd.mp4");
    expect(args).toContain("+faststart");
  });

  it("prepends gpu hwaccel input args for a gpu profile", () => {
    const args = buildFfmpegArgs("/m.mp4", ["hd"], buildEncoderProfile("nvenc"),
      (r) => `/o-${r}.mp4`);
    const i = args.indexOf("-i");
    // hwaccel args appear before -i
    expect(args.slice(0, i)).toContain("cuda");
  });
});

describe("parseFfprobe", () => {
  it("parses fps from r_frame_rate and nb_frames", () => {
    const json = JSON.stringify({
      streams: [{ r_frame_rate: "30/1", nb_frames: "4830", width: 1920, height: 1440, duration: "161.0" }],
      format: { duration: "161.0" },
    });
    const p = parseFfprobe(json);
    expect(p.fps).toBe(30);
    expect(p.durationInFrames).toBe(4830);
    expect(p.width).toBe(1920);
    expect(p.height).toBe(1440);
  });

  it("falls back to duration*fps when nb_frames is N/A", () => {
    const json = JSON.stringify({
      streams: [{ r_frame_rate: "30/1", nb_frames: "N/A", width: 1440, height: 1080, duration: "10.0" }],
      format: { duration: "10.0" },
    });
    const p = parseFfprobe(json);
    expect(p.durationInFrames).toBe(300);
  });

  it("handles fractional frame rate (e.g. 30000/1001)", () => {
    const json = JSON.stringify({
      streams: [{ r_frame_rate: "30000/1001", duration: "10.0", width: 640, height: 480 }],
      format: {},
    });
    const p = parseFfprobe(json);
    expect(p.fps).toBe(30); // round(29.97)
  });

  it("defaults fps to 30 when rate is unparseable", () => {
    const json = JSON.stringify({ streams: [{ r_frame_rate: "0/0", duration: "5" }], format: {} });
    const p = parseFfprobe(json);
    expect(p.fps).toBe(30);
  });
});
