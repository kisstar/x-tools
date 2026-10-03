#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-/tmp/xtools-puppeteer-cache}"
output_dir=$(mktemp -d)
cleanup() { rm -rf "$output_dir"; }
trap cleanup EXIT INT TERM

find "$repo_root" -name '*.mmd' -not -path '*/node_modules/*' -not -path '*/.git/*' -print | while IFS= read -r diagram; do
  output=$output_dir/$(basename "$diagram").svg
  pnpm exec mmdc --quiet --input "$diagram" --output "$output"
done
