#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DIR="$ROOT/apps/web/public/models"
mkdir -p "$DIR"
OUT="$DIR/face_recognition_sface_2021dec.onnx"
if [ -f "$OUT" ] && [ "$(wc -c < "$OUT")" -gt 1000000 ]; then
  echo "sface model already present"
  exit 0
fi
URL="https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
echo "downloading SFace ONNX → $OUT"
curl -fL --retry 3 -o "$OUT" "$URL"
ls -l "$OUT"
