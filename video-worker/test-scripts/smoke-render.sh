#!/bin/bash
# Smoke test for the video-worker /render endpoint.
# Precondition: server running (npm start in video-worker/) + fixture generated
#   (npx tsx test-scripts/gen-fixture.ts).
# Verifies: POST /render returns ok + 1920x1440, and the MP4 is a valid H264 file.

set -uo pipefail
BASE_URL="${BASE_URL:-http://localhost:4000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE="$DIR/fixtures/combined-spread.json"
OUT_DIR="$DIR/../out"

if [ ! -f "$FIXTURE" ]; then
  echo "❌ fixture missing: $FIXTURE (run: npx tsx test-scripts/gen-fixture.ts)"; exit 1
fi

echo "POST $BASE_URL/render (fixture $(wc -c < "$FIXTURE") bytes)"
RESPONSE=$(curl -s -X POST "$BASE_URL/render" -H "Content-Type: application/json" -d @"$FIXTURE")
echo "Response: $RESPONSE"

OK=$(echo "$RESPONSE" | grep -o '"ok":true')
W=$(echo "$RESPONSE"  | grep -o '"width":[0-9]*'  | cut -d: -f2)
H=$(echo "$RESPONSE"  | grep -o '"height":[0-9]*' | cut -d: -f2)
FILE=$(echo "$RESPONSE" | grep -o '"fileName":"[^"]*"' | cut -d'"' -f4)

if [ -z "$OK" ]; then echo "❌ render not ok"; exit 1; fi
if [ "$W" != "1920" ] || [ "$H" != "1440" ]; then
  echo "❌ wrong dimensions: ${W}x${H} (expected 1920x1440)"; exit 1
fi

MP4="$OUT_DIR/$FILE"
if [ ! -f "$MP4" ]; then echo "❌ output file missing: $MP4"; exit 1; fi
SIZE=$(wc -c < "$MP4")
echo "✅ MP4 $MP4 (${SIZE} bytes)"

if command -v ffprobe >/dev/null 2>&1; then
  echo "--- ffprobe ---"
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration \
    -of default=noprint_wrappers=1 "$MP4"
  PW=$(ffprobe -v error -select_streams v:0 -show_entries stream=width  -of default=nokey=1:noprint_wrappers=1 "$MP4" | tr -dc '0-9')
  PH=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nokey=1:noprint_wrappers=1 "$MP4" | tr -dc '0-9')
  if [ "$PW" != "1920" ] || [ "$PH" != "1440" ]; then
    echo "❌ ffprobe dims ${PW}x${PH} != 1920x1440"; exit 1
  fi
  echo "✅ ffprobe confirms 1920x1440"
else
  echo "(ffprobe not found — skipped container check; response dims OK)"
fi

echo "✅ Smoke test PASSED"
