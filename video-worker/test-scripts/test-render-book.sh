#!/bin/bash
# Test script for: POST /render-book — full-book chunked render + concat + optional BGM mux
# Created: 2026-06-05
# Usage:
#   ./test-scripts/test-render-book.sh              # no BGM
#   BGM_URL=https://example.com/music.mp3 ./test-render-book.sh  # with BGM
#   BASE_URL=http://localhost:4000 ./test-render-book.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
TOKEN="${VIDEO_WORKER_TOKEN:-}"
BGM_URL="${BGM_URL:-}"

FIXTURE_DIR="$(cd "$(dirname "$0")/fixtures" && pwd)"
PAYLOAD_FILE="$FIXTURE_DIR/book-multi-spread.json"

if [[ ! -f "$PAYLOAD_FILE" ]]; then
  echo "❌ Fixture not found: $PAYLOAD_FILE"
  exit 1
fi

# ─── Build request payload ────────────────────────────────────────────────────
# The fixture stores spreads/sections/edition/language at top level.
# The /render-book handler expects: { illustration: {spreads,sections}, edition, language, bgm? }
# Transform here using python3.
if [[ -n "$BGM_URL" ]]; then
  PAYLOAD=$(python3 -c "
import json, sys
with open('$PAYLOAD_FILE') as f:
    d = json.load(f)
payload = {
    'illustration': {'spreads': d['spreads'], 'sections': d.get('sections', [])},
    'edition': d.get('edition', 'classic'),
    'language': d.get('language', 'en_US'),
    'bgm': {'url': '$BGM_URL', 'volume': 0.6}
}
print(json.dumps(payload))
")
  echo "▶ Testing /render-book WITH bgm url=$BGM_URL"
else
  PAYLOAD=$(python3 -c "
import json, sys
with open('$PAYLOAD_FILE') as f:
    d = json.load(f)
payload = {
    'illustration': {'spreads': d['spreads'], 'sections': d.get('sections', [])},
    'edition': d.get('edition', 'classic'),
    'language': d.get('language', 'en_US'),
}
print(json.dumps(payload))
")
  echo "▶ Testing /render-book WITHOUT bgm"
fi

# ─── Auth header ─────────────────────────────────────────────────────────────
AUTH_HEADER=""
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER="-H \"X-Worker-Token: $TOKEN\""
fi

echo "Payload size: $(echo "$PAYLOAD" | wc -c) bytes"
echo "POST $BASE_URL/render-book ..."

RESPONSE=$(curl -s -w "\n__STATUS__:%{http_code}" -X POST "$BASE_URL/render-book" \
  ${TOKEN:+-H "X-Worker-Token: $TOKEN"} \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_STATUS=$(echo "$RESPONSE" | grep '__STATUS__:' | sed 's/__STATUS__://')
BODY=$(echo "$RESPONSE" | grep -v '__STATUS__:')

echo ""
echo "HTTP Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

# ─── Validate response ───────────────────────────────────────────────────────
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "❌ Test FAILED — expected HTTP 200, got $HTTP_STATUS"
  exit 1
fi

if ! echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('ok') is True, 'ok!=true'" 2>/dev/null; then
  echo "❌ Test FAILED — response.ok is not true"
  exit 1
fi

PUBLIC_URL=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('publicUrl',''))" 2>/dev/null)
FILE_NAME=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fileName',''))" 2>/dev/null)
SPREADS_RENDERED=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('spreadsRendered',0))" 2>/dev/null)
DURATION=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('durationInFrames',0))" 2>/dev/null)
WARNINGS=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('warnings',[]))" 2>/dev/null)

echo "  publicUrl:       $PUBLIC_URL"
echo "  fileName:        $FILE_NAME"
echo "  spreadsRendered: $SPREADS_RENDERED"
echo "  durationInFrames:$DURATION"
echo "  warnings:        $WARNINGS"

# Verify the MP4 is actually served
echo ""
echo "GET $BASE_URL$PUBLIC_URL ..."
MP4_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$PUBLIC_URL")
echo "MP4 serve status: $MP4_STATUS"

if [[ "$MP4_STATUS" != "200" ]]; then
  echo "❌ Test FAILED — GET $PUBLIC_URL returned HTTP $MP4_STATUS (expected 200)"
  exit 1
fi

# Content-type check
MP4_CT=$(curl -s -I "$BASE_URL$PUBLIC_URL" | grep -i 'content-type' | tr -d '\r')
echo "Content-Type: $MP4_CT"

if ! echo "$MP4_CT" | grep -qi 'video/mp4'; then
  echo "⚠ Warning: Content-Type does not contain video/mp4"
fi

echo ""

# ─── BGM variant check ───────────────────────────────────────────────────────
if [[ -n "$BGM_URL" ]]; then
  if echo "$WARNINGS" | grep -q "bgm_skipped"; then
    echo "⚠ BGM was DEGRADED (skipped) — warnings: $WARNINGS"
    echo "  (This is acceptable if BGM URL was unreachable)"
  else
    echo "✅ BGM mux: no bgm_skipped warning → BGM was applied"
  fi
fi

# ─── Seam verification (optional, requires ffprobe) ─────────────────────────
if command -v ffprobe &>/dev/null && [[ -n "$FILE_NAME" ]]; then
  OUT_DIR="$(cd "$(dirname "$0")/../out" && pwd 2>/dev/null || true)"
  MP4_PATH="$OUT_DIR/$FILE_NAME"
  if [[ -f "$MP4_PATH" ]]; then
    echo "ffprobe $MP4_PATH ..."
    PROBE=$(ffprobe -v quiet -show_format -show_streams "$MP4_PATH" 2>&1 | head -30)
    echo "$PROBE"
  fi
fi

echo ""
echo "✅ Test PASSED — /render-book returned 200, MP4 served at $PUBLIC_URL"
echo "   spreadsRendered=$SPREADS_RENDERED  durationInFrames=$DURATION"
exit 0
