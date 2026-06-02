// remotion/lottie/load-dotlottie-json.ts
// Extracts a self-contained Lottie animationData JSON from a dotLottie (.lottie) asset so
// it can be fed to @remotion/lottie <Lottie animationData> (frame-deterministic). dotLottie
// is a ZIP; we unzip with fflate (pure JS, no WASM — the WASM `?url` import in the original
// player was the bundle blocker we replaced). Two layouts are handled:
//   v1: manifest.json + animations/<id>.json
//   v2: manifest.json + a/<id>.json + i/<asset>.png   (compact, @dotlottie/dotlottie-js)
// External image assets (e:0, referenced via u+p, stored inside the zip) are INLINED as
// base64 data URIs — lottie-web inside @remotion/lottie has no zip/URL context to resolve
// them otherwise, so without this the animation renders blank (the bug this fixes).
// Plain .json lottie URLs are passed through unchanged.

import { unzipSync } from "fflate";

const decoder = new TextDecoder();

interface DotLottieManifest {
  animations?: Array<{ id?: string }>;
}

interface LottieAsset {
  id?: string;
  p?: string; // filename or (once inlined) data URI
  u?: string; // path prefix, e.g. "/i/"
  e?: number; // 0 = external file, 1 = embedded data URI
}

interface LottieJson {
  assets?: LottieAsset[];
  [k: string]: unknown;
}

type ZipFiles = Record<string, Uint8Array>;

/** Fetch + decode a .lottie (zip) or .json lottie into render-ready animationData. */
export async function loadDotLottieAnimationData(src: string): Promise<unknown> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`lottie fetch failed ${res.status} for ${src}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  // ZIP magic "PK\x03\x04" → dotLottie container; else assume raw lottie JSON.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    return JSON.parse(decoder.decode(bytes));
  }

  const files = unzipSync(bytes);
  const animBytes = findAnimationJson(files);
  if (!animBytes) {
    throw new Error(`no animation json found in dotLottie ${src}`);
  }

  const animation = JSON.parse(decoder.decode(animBytes)) as LottieJson;
  inlineExternalAssets(animation, files);
  return animation;
}

/** Locate the animation JSON across v1 (animations/) and v2 (a/) layouts. */
function findAnimationJson(files: ZipFiles): Uint8Array | undefined {
  const manifestBytes = files["manifest.json"];
  if (manifestBytes) {
    const id = (JSON.parse(decoder.decode(manifestBytes)) as DotLottieManifest).animations?.[0]?.id;
    if (id) {
      for (const candidate of [`a/${id}.json`, `animations/${id}.json`, `${id}.json`]) {
        if (files[candidate]) return files[candidate];
      }
    }
  }
  // Fallback: first JSON under a/ or animations/ that isn't the manifest.
  const key = Object.keys(files).find(
    (k) => k !== "manifest.json" && k.endsWith(".json") && /(^|\/)(a|animations)\//.test(k)
  );
  return key ? files[key] : undefined;
}

/** Replace external image asset refs with embedded base64 data URIs from the zip. */
function inlineExternalAssets(animation: LottieJson, files: ZipFiles): void {
  if (!Array.isArray(animation.assets)) return;
  for (const asset of animation.assets) {
    if (!asset || asset.e === 1 || !asset.p) continue; // already embedded or not a file ref
    const fileBytes = resolveAssetFile(files, asset.u ?? "", asset.p);
    if (!fileBytes) continue; // leave as-is; lottie will just skip a missing asset
    asset.p = `data:${mimeFor(asset.p)};base64,${toBase64(fileBytes)}`;
    asset.u = "";
    asset.e = 1;
  }
}

function resolveAssetFile(files: ZipFiles, u: string, p: string): Uint8Array | undefined {
  const direct = `${u}${p}`.replace(/^\//, "");
  if (files[direct]) return files[direct];
  if (files[p]) return files[p];
  const base = p.split("/").pop() ?? p;
  const key = Object.keys(files).find((k) => k === base || k.endsWith(`/${base}`));
  return key ? files[key] : undefined;
}

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

/** Uint8Array → base64 (chunked to avoid call-stack limits on large images). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
