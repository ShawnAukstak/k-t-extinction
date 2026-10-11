#!/usr/bin/env bash
# Everything that must pass before a commit: types, unit tests, browser tests.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit
npx vitest run --reporter=dot
npx playwright test --reporter=dot
echo "✓ all checks passed"
