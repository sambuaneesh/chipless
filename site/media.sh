#!/usr/bin/env bash
# Regenerate site/media from a fresh capture. Needs: dev server running (./gradlew :server:dev), chromium, ffmpeg, imagemagick.
# Usage: site/media.sh <hostUrl> <guestUrl>
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
cp site/capture.mjs web/.capture.tmp.mjs
(cd web && node .capture.tmp.mjs "$1" "$2" "$tmp") ; rm -f web/.capture.tmp.mjs
for f in home deal raise guest-turn referee result settle invite guest-join flop showdown; do
  magick "$tmp/$f.png" -resize 600x -quality 80 "site/media/$f.webp"
done
ffmpeg -loglevel error -y -i "$tmp"/raw/*.webm -vf "setpts=PTS/1.15,fps=30,scale=390:-2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart -an site/media/demo.mp4
ffmpeg -loglevel error -y -i site/media/demo.mp4 -ss 1 -frames:v 1 "$tmp/poster.png"
magick "$tmp/poster.png" -quality 78 site/media/poster.webp
rm -rf "$tmp"
echo "media updated"
