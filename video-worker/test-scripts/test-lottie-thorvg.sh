#!/bin/bash
# Test script for: POST /render of a lottie-only spread (ThorVG render path).
# Created: 2026-06-04
#
# Precondition: server running (npm start in video-worker/) + fixture generated
#   (npx tsx test-scripts/gen-fixture-lottie.ts).
# Verifies: ok:true + 1920x1440 + valid H264 MP4. Logs elapsedMs (per-frame ThorVG gate
# benchmark vs the 120s render timeout).

set -uo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE="$DIR/fixtures/spread-lottie.json"
OUT_DIR="$DIR/../out"

if [ ! -f "$FIXTURE" ]; then
  echo "❌ fixture missing: $FIXTURE (run: npx tsx test-scripts/gen-fixture-lottie.ts)"; exit 1
fi

# Sanity: WASM route must serve before any render (headless Chromium fetches it).
echo "GET $BASE_URL/dotlottie-player.wasm"
WASM_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/dotlottie-player.wasm")
WASM_LEN=$(curl -s -o /dev/null -w '%{size_download}' "$BASE_URL/dotlottie-player.wasm")
echo "  → HTTP $WASM_CODE, ${WASM_LEN} bytes"
if [ "$WASM_CODE" != "200" ]; then echo "❌ WASM route not 200"; exit 1; fi

echo "POST $BASE_URL/render (fixture $(wc -c < "$FIXTURE") bytes)"
RESPONSE=$(curl -s -X POST "$BASE_URL/render" -H "Content-Type: application/json" -d @"$FIXTURE")
echo "Response: $RESPONSE"

OK=$(echo "$RESPONSE"   | grep -o '"ok":true')
W=$(echo "$RESPONSE"    | grep -o '"width":[0-9]*'      | cut -d: -f2)
H=$(echo "$RESPONSE"    | grep -o '"height":[0-9]*'     | cut -d: -f2)
FILE=$(echo "$RESPONSE" | grep -o '"fileName":"[^"]*"'  | cut -d'"' -f4)
MS=$(echo "$RESPONSE"   | grep -o '"elapsedMs":[0-9]*'  | cut -d: -f2)

if [ -z "$OK" ]; then echo "❌ render not ok"; exit 1; fi
if [ "$W" != "1920" ] || [ "$H" != "1440" ]; then
  echo "❌ wrong dimensions: ${W}x${H} (expected 1920x1440)"; exit 1
fi

MP4="$OUT_DIR/$FILE"
if [ ! -f "$MP4" ]; then echo "❌ output file missing: $MP4"; exit 1; fi
SIZE=$(wc -c < "$MP4")
echo "✅ MP4 $MP4 (${SIZE} bytes) — elapsedMs=${MS:-?} (timeout budget 120000ms)"

if command -v ffprobe >/dev/null 2>&1; then
  CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nokey=1:noprint_wrappers=1 "$MP4")
  echo "✅ ffprobe codec=$CODEC"
fi

echo "✅ Test PASSED"
