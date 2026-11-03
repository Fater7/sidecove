#!/usr/bin/env bash
# Runs the end-to-end suite the way .github/workflows/e2e-tests.yml does, on this machine, and
# ends with one summary line to paste into a pull request (see .github/pull_request_template.md).
#
# It builds the latest release and v1.1.0 (what the upgrade test updates from) into a temporary
# folder, points SIDECOVE_PREVIOUS_BUILD at them, and runs `npm run test:e2e`. The browser is
# Puppeteer's own Chrome for Testing, never the installed Google Chrome app. Everything it
# creates, including every browser profile, lives in one temporary folder that is removed on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Puppeteer reads these to pick another browser; the suite must use the one it downloads itself.
unset PUPPETEER_EXECUTABLE_PATH PUPPETEER_CHANNEL PUPPETEER_BROWSER PUPPETEER_SKIP_DOWNLOAD

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sidecove-e2e.XXXXXX")"
# Puppeteer and the upgrade test create their profiles under TMPDIR, so pointing it here lets
# cleanup find every browser this run started by its command line.
export TMPDIR="$WORK/tmp"
mkdir -p "$TMPDIR"

cleanup() {
  pkill -f "$WORK" 2>/dev/null || true
  sleep 1
  pkill -9 -f "$WORK" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[ -d node_modules ] || npm ci

echo "==> Making sure Puppeteer's Chrome for Testing is downloaded"
npx puppeteer browsers install chrome

# The workflow asks GitHub for the latest release. Releases are tagged vX.Y.Z, so the highest
# local tag is the fallback when gh cannot answer.
REPO="$(git remote get-url origin | sed -E 's#(\.git)?$##; s#^.*[:/]([^/:]+/[^/:]+)$#\1#')"
if ! LATEST="$(gh release view --repo "$REPO" --json tagName --jq .tagName 2>/dev/null)"; then
  LATEST="$(git tag --list 'v[0-9]*' --sort=-v:refname | head -n 1)"
  echo "==> gh could not report the latest release; using the newest local tag: ${LATEST:-none}"
fi

BUILDS=""
for RELEASE in $(printf '%s\n' $LATEST v1.1.0 | sort -u); do
  echo "==> Building $RELEASE"
  git rev-parse --verify --quiet "refs/tags/$RELEASE" >/dev/null || git fetch --depth=1 origin tag "$RELEASE"
  DIR="$WORK/sidecove-$RELEASE"
  mkdir -p "$DIR"
  git archive "$RELEASE" | tar -x -C "$DIR"
  (cd "$DIR" && PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund && npm run build)
  BUILDS="${BUILDS:+$BUILDS:}$DIR/dist"
done
export SIDECOVE_PREVIOUS_BUILD="$BUILDS"

COMMIT="$(git rev-parse HEAD)"
DIRTY=""
[ -z "$(git status --porcelain)" ] || DIRTY=" (with uncommitted changes)"

echo "==> Running the end-to-end suite on ${COMMIT:0:12}"
RESULT="$WORK/jest-result.json"
STATUS=0
# The workflow sets CI so the upgrade test refuses to relabel the current build.
CI=true npm run test:e2e -- --json --outputFile="$RESULT" || STATUS=$?

if [ ! -s "$RESULT" ]; then
  echo "The suite did not produce a result (exit status $STATUS); nothing to summarise." >&2
  exit "${STATUS:-1}"
fi

SUMMARY="$(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const crashed = r.numRuntimeErrorTestSuites ? `, ${r.numRuntimeErrorTestSuites} suites could not run` : "";
  console.log(`${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numTotalTests} total${crashed}`);
' "$RESULT")"

echo
echo "End-to-end tests: ${COMMIT}${DIRTY}, ${SUMMARY}, $(date -u +%Y-%m-%d)"
exit "$STATUS"
