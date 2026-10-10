#!/usr/bin/env bash
# Swap package.json AND package-lock.json between the production and dev sets.
#
#   bash scripts/use-deps.sh dev    # dev machine: adds expo-dev-client + @expo/ngrok
#   bash scripts/use-deps.sh prod   # release / F-Droid / Play: strips both
#
# Why: the F-Droid recipe and the Google Play build must not see dev tooling.
# expo-dev-client pulls expo-dev-launcher (whose android/build.gradle has a
# `debugOnly com.google.android.gms:play-services-code-scanner` dependency), and
# @expo/ngrok downloads a proprietary prebuilt ngrok binary at install time.
# Both are dev-only, so they live in package.dev.json instead of package.json.
# The plugin side of the same split is in app.config.js, gated on EXPO_TARGET.
#
# The lockfile is NOT optional bookkeeping. EAS runs `npm ci --include=dev` and
# the F-Droid recipe runs `npm ci`; both REFUSE to install when package.json and
# package-lock.json disagree, and they install the lockfile regardless of the
# manifest. So this script keeps two complete, internally-consistent pairs:
#
#   prod (committed):  package.json + package-lock.json
#   dev   (local):     package.dev.json + package-lock.dev.json
#
# and it REGENERATES the dev lockfile itself. Leaving that to a manual
# `npm install` is how you end up with a dev manifest paired to a prod lockfile:
#   npm error Missing: expo-dev-client@57.0.19 from lock file
set -euo pipefail

cd "$(dirname "$0")/.."

# Skip git operations entirely when there is no repo (F-Droid build tree).
git_cmd() { git "$@" 2>/dev/null || true; }

MANIFESTS=(package.json package.dev.json)
LOCKS=(package-lock.json package-lock.dev.json)

# Restore the authoritative production manifest. Read the PATH into a variable
# first — `cp "$(cat f)" package.json` passes the file's *contents* as a path,
# which fails with "No such file or directory".
prod_src=package.json
if [ -f package.prod.json ]; then prod_src=package.prod.json; fi

prod_lock_src=package-lock.json
if [ -f package-lock.prod.json ]; then prod_lock_src=package-lock.prod.json; fi

# Which set is currently active? Drive off the manifest content, never off the
# presence of a backup file (that got out of sync once already).
current_mode() {
  if grep -q '"expo-dev-client"' package.json 2>/dev/null; then echo dev; else echo prod; fi
}

MODE="${1:-}"
case "$MODE" in
  dev|prod) ;;
  *)
    cat >&2 <<'EOF'
usage: bash scripts/use-deps.sh {dev|prod}

  dev   dev-client + @expo/ngrok installed; needs a network-install to fetch them
  prod  production dependency set; what Play and F-Droid must build
EOF
    exit 1
    ;;
esac

if [ "$(current_mode)" = "$MODE" ]; then
  # Already in the right mode. Still verify the lockfile matches the manifest —
  # that is exactly the condition that broke the EAS build, and it can go stale
  # whenever a dependency is edited without regenerating the lock.
  if npm ci --dry-run --include=dev >/dev/null 2>&1; then
    echo "already in $MODE mode — manifest and lockfile are in sync"
    exit 0
  fi
  echo "already in $MODE mode, but package-lock.json is out of sync with package.json" >&2
  echo "regenerating the lockfile..." >&2
fi

case "$MODE" in
  dev)
    # Preserve the authoritative production set before touching anything. Only
    # overwrite the backup when package.json still holds production content, so
    # a dev->dev repair run cannot clobber the real prod pair.
    if [ "$(current_mode)" = "prod" ]; then
      cp package.json package.prod.json
      cp package-lock.json package-lock.prod.json
    fi
    cp package.dev.json package.json
    # The dev lockfile is generated, never hand-maintained. --package-lock-only
    # leaves node_modules alone so an in-flight dev server keeps working.
    npm install --package-lock-only --include=dev --no-audit --no-fund >/dev/null
    mv package-lock.json package-lock.dev.json
    cp package-lock.dev.json package-lock.json
    git_cmd update-index --skip-worktree package-lock.json
    cat <<EOF
-> dev mode
   package.json          <- package.dev.json (dev-client + @expo/ngrok)
   package-lock.dev.json <- regenerated from that manifest
   package-lock.json     <- same content, skip-worktree (cannot be committed)
   npm ci will now resolve. node_modules was NOT touched.
   next: npm install && eas build --profile development --platform android
EOF
    ;;

  prod)
    if [ "$prod_src" != "package.json" ]; then
      cp "$prod_src" package.json
    fi
    if [ -f package-lock.prod.json ]; then
      cp "$prod_lock_src" package-lock.json
      rm -f package-lock.prod.json
    else
      # No stored prod lock: rebuild it from the prod manifest, otherwise
      # package.json and package-lock.json would disagree again.
      npm install --package-lock-only --omit=dev --no-audit --no-fund >/dev/null
    fi
    git_cmd update-index --no-skip-worktree package-lock.json
    cat <<'EOF'
-> production mode
   package.json + package-lock.json restored to the committed production set.
   For a release: commit these two together before tagging, so Play and the
   F-Droid recipe clone a consistent pair.
   next: npm install  (node_modules drops dev-client/ngrok)
EOF
    ;;
esac

# Report the real sync state rather than asserting success.
if npm ci --dry-run --include=dev >/dev/null 2>&1; then
  echo "verified: package.json and package-lock.json are in sync"
else
  echo "WARNING: package.json and package-lock.json are still out of sync" >&2
  npm ci --dry-run --include=dev 2>&1 | grep -E 'Missing:|Invalid:' | head -10 >&2 || true
  exit 1
fi