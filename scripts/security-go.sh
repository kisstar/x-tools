#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-/tmp/xtools-go-cache}"
export GOMODCACHE="${GOMODCACHE:-/tmp/xtools-go-modcache}"
tool_bin=${XTOOLS_TOOL_BIN:-/private/tmp/xtools-tools}
govulncheck=$tool_bin/govulncheck
govuln_db=${GOVULNDB:-https://vuln.go.dev}

if [ ! -x "$govulncheck" ]; then
  printf '%s\n' "govulncheck v1.8.0 不可用；请运行 GOBIN=$tool_bin go install golang.org/x/vuln/cmd/govulncheck@v1.8.0" >&2
  exit 1
fi

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
  (cd "$module_dir" && "$govulncheck" -db "$govuln_db" ./...)
done
