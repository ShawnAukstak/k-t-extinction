#!/usr/bin/env bash
# Deploy build (Render): fetch the generated data bundle (not in git; see tools/fetch-data.mjs), then
# build the static site into app/dist. Needs GH_DATA_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/fetch-data.mjs
npm ci
npm run build
