#!/usr/bin/env bash
# Deploy build (Render): fetch the generated data bundle (not in git; see tools/fetch-data.mjs), then
# build the static site into app/dist. Needs GH_DATA_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
# Google Analytics for the deployed site (app/src/core/analytics.ts); public anyway, it appears in the page.
# Set here rather than in render.yaml, whose environment changes only apply when the Blueprint syncs.
export GA_ID="${GA_ID:-G-93G9HMSBN0}"
node tools/fetch-data.mjs
npm ci
npm run build
