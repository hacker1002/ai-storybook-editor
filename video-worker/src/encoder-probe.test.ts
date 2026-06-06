// Unit tests for encoder-probe pure helpers (no ffmpeg spawn).
import { describe, it, expect } from "vitest";

import { parseAvailableEncoders, buildEncoderProfile } from "./encoder-probe.js";

describe("parseAvailableEncoders", () => {
  it("detects h264_nvenc and h264_qsv when listed", () => {
    const out = [
      " V....D h264_nvenc           NVIDIA NVENC H.264 encoder",
      " V....D h264_qsv             H.264 (Intel Quick Sync Video)",
      " V....D libx264              libx264 H.264 / AVC",
    ].join("\n");
    expect(parseAvailableEncoders(out)).toEqual({ nvenc: true, qsv: true });
  });

  it("returns false for absent encoders (cpu-only build)", () => {
    const out = " V....D libx264              libx264 H.264 / AVC";
    expect(parseAvailableEncoders(out)).toEqual({ nvenc: false, qsv: false });
  });

  it("detects only nvenc when qsv missing", () => {
    const out = "h264_nvenc NVIDIA";
    expect(parseAvailableEncoders(out)).toEqual({ nvenc: true, qsv: false });
  });
});

describe("buildEncoderProfile", () => {
  it("cpu → libx264 + lanczos scale + crf opts", () => {
    const p = buildEncoderProfile("cpu");
    expect(p.name).toBe("cpu");
    expect(p.venc).toBe("libx264");
    expect(p.scaleFilter).toBe("scale");
    expect(p.scaleSuffix).toBe(":flags=lanczos");
    expect(p.hwaccelIn).toEqual([]);
    expect(p.encOpts).toContain("-crf");
    expect(p.encOpts).toContain("-preset");
  });

  it("nvenc → h264_nvenc + scale_cuda + cuda hwaccel + cq", () => {
    const p = buildEncoderProfile("nvenc");
    expect(p.venc).toBe("h264_nvenc");
    expect(p.scaleFilter).toBe("scale_cuda");
    expect(p.scaleSuffix).toBe("");
    expect(p.hwaccelIn).toEqual(["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]);
    expect(p.encOpts).toContain("-cq");
  });

  it("qsv → h264_qsv + scale_qsv + qsv hwaccel + global_quality", () => {
    const p = buildEncoderProfile("qsv");
    expect(p.venc).toBe("h264_qsv");
    expect(p.scaleFilter).toBe("scale_qsv");
    expect(p.hwaccelIn).toEqual(["-hwaccel", "qsv"]);
    expect(p.encOpts).toContain("-global_quality");
  });
});
