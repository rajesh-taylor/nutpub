#!/bin/sh
# Web copy of one of Rajesh's photos: 1080 px wide, all metadata (camera, GPS, dates) removed.
# Usage: scripts/photo.sh <original.jpg> <name>   → public/img/<name>.jpg
set -e
ffmpeg -loglevel error -y -i "$1" -vf "scale=1080:-2" -map_metadata -1 -q:v 5 "$(dirname "$0")/../public/img/$2.jpg"
ls -la "$(dirname "$0")/../public/img/$2.jpg"
