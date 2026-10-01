#!/bin/sh
# Cut a track into 10-second WAV segments (mono, 32 kHz): sample-exact, so they play back gaplessly.
# Usage: scripts/segments.sh <track>   (no track: a placeholder chord loop for testing)
set -e
out="$(dirname "$0")/../media/segments"
rm -rf "$out"; mkdir -p "$out"
if [ -n "$1" ]; then
  src="$1"
else
  src="$out/../placeholder.wav"
  ffmpeg -loglevel error -y -f lavfi -i "aevalsrc='0.2*sin(2*PI*(220+55*floor(mod(t,8)/2))*t)+0.15*sin(2*PI*(330+82.5*floor(mod(t,8)/2))*t)*(0.6+0.4*sin(2*PI*2*t))':s=32000:d=80" "$src"
fi
ffmpeg -loglevel error -y -i "$src" -ac 1 -ar 32000 -c:a pcm_s16le -f segment -segment_time 10 "$out/seg-%03d.wav"
ls "$out" | wc -l
