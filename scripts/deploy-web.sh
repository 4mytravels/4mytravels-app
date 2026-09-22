#!/usr/bin/env bash
# Deploy the 4MyTravels PWA static export to /opt/sites/4mytravels-pwa/html.
# Run from the repo root after `npx expo export --platform web`.
#
# The nginx container mounts ./html read-only, so replacing the directory
# contents is safe. Keeps one previous version as html.bak for rollback.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$REPO_DIR/dist"
TARGET="/opt/sites/4mytravels-pwa/html"

if [ ! -f "$DIST/index.html" ]; then
  echo "ERROR: $DIST/index.html not found — run 'npx expo export --platform web' first." >&2
  exit 1
fi

STAMP="$(date +%Y-%m-%d-%H%M)"
if [ -d "$TARGET" ]; then
  rm -rf "${TARGET}.bak" 2>/dev/null || true
  cp -r "$TARGET" "${TARGET}.bak-$STAMP" 2>/dev/null || true
fi

mkdir -p "$TARGET"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$DIST/" "$TARGET/"
else
  # rsync not installed: clean copy via a temp dir swap.
  TMP="${TARGET}.new"
  rm -rf "$TMP"
  cp -r "$DIST" "$TMP"
  rm -rf "$TARGET"
  mv "$TMP" "$TARGET"
fi

echo "Deployed to $TARGET"
echo "If nginx is running: docker restart site-4mytravels-pwa (or it picks up files automatically — html is a live mount)."
