#!/bin/sh
# Cut a recorded set into 10-second pieces, each sold behind its own 402:
#   media/set/audio/seg-NNN.wav  sound: 44.1 kHz stereo PCM, sample-exact, so the pieces play back gaplessly
#   media/set/video/seg-NNN.mp4  picture: H.264, no sound, a keyframe at the start of each piece
# The last piece is padded to a full 10 s (silence, last frame held).
# Usage: scripts/cut-set.sh <video file>
set -e
[ -n "$1" ] || { echo "usage: $0 <video file>"; exit 1; }
out="$(dirname "$0")/../media/set"
rm -rf "$out"; mkdir -p "$out/audio" "$out/video"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
n=$(awk -v d="$dur" 'BEGIN { print int((d + 9.999) / 10) }')
i=0
while [ "$i" -lt "$n" ]; do
  f=$(printf 'seg-%03d' "$i")
  ffmpeg -loglevel error -y -ss "$((i * 10))" -t 10 -i "$1" -vn -af apad -t 10 -ac 2 -ar 44100 -c:a pcm_s16le "$out/audio/$f.wav"
  ffmpeg -loglevel error -y -ss "$((i * 10))" -t 10 -i "$1" -an -vf "tpad=stop_mode=clone:stop_duration=10,scale=1280:-2" -t 10 \
    -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -movflags +faststart "$out/video/$f.mp4"
  i=$((i + 1))
done
printf '{ "segments": %s, "segmentMs": 10000 }\n' "$n" > "$out/set.json"
echo "$n pieces in media/set"
