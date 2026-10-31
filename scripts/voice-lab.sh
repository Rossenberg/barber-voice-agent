#!/bin/sh
# Runs the voice assistant locally (it is off on the live site).
# The site files + voice-lab/ are merged into a temp folder and served by `wrangler dev` with VOICE_ENABLED=1.
# Open: http://localhost:8878/try/?biz=blade  ·  /realtime/  ·  /lab/  ·  /dashboard/
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
cp -R "$root/web/." "$tmp/"
cp -R "$root/voice-lab/." "$tmp/"
rm -f "$tmp/README.md"
cd "$root/backend"
npx wrangler dev --port 8878 --assets "$tmp" --var VOICE_ENABLED:1
