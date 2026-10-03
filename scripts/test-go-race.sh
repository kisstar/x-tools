#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-/tmp/xtools-go-cache}"
export GOMODCACHE="${GOMODCACHE:-/tmp/xtools-go-modcache}"

go work edit -json | awk '
  /"DiskPath"/ {
    value = $2
    gsub(/[",]/, "", value)
    print value
  }
' | while IFS= read -r module_path; do
  case "$module_path" in
    /*) module_dir=$module_path ;;
    *) module_dir=$repo_root/$module_path ;;
  esac
  (cd "$module_dir" && go test -race ./...)
done
