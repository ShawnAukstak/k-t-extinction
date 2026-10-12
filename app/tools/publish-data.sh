#!/usr/bin/env bash
# Publish the generated app data (app/public/data, not in git) as a release asset of this repo, and
# point data-bundle.json at it so deploys fetch exactly this bundle. Run after the data scripts change
# their output; commit data-bundle.json afterwards.
#   bash tools/publish-data.sh data-v2
set -euo pipefail
cd "$(dirname "$0")/.."
tag="${1:?usage: publish-data.sh <release tag, e.g. data-v2>}"
asset=kt-app-data.tar.gz
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
tmp=$(mktemp -d)
COPYFILE_DISABLE=1 tar -czf "$tmp/$asset" --exclude .DS_Store -C public data
sha=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
gh release create "$tag" "$tmp/$asset" --repo "$repo" --latest=false \
  --title "App data $tag" \
  --notes "Generated app data (app/public/data) for deploys, built by scripts/process_*.py. sha256 $sha"
printf '{\n  "repo": "%s",\n  "tag": "%s",\n  "asset": "%s",\n  "sha256": "%s"\n}\n' "$repo" "$tag" "$asset" "$sha" > data-bundle.json
echo "published $tag ($(du -h "$tmp/$asset" | cut -f1)); data-bundle.json updated — commit it"
