#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-/tmp/xtools-go-cache}"
export GOMODCACHE="${GOMODCACHE:-/tmp/xtools-go-modcache}"
export GOLANGCI_LINT_CACHE="${GOLANGCI_LINT_CACHE:-/tmp/xtools-golangci-lint-cache}"
tool_bin=${XTOOLS_TOOL_BIN:-/private/tmp/xtools-tools}
golangci_lint=$tool_bin/golangci-lint

if [ ! -x "$golangci_lint" ]; then
  printf '%s\n' "golangci-lint v2.14.0 不可用；请运行 GOBIN=$tool_bin go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0" >&2
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
  (cd "$module_dir" && go vet ./...)
  (cd "$module_dir" && "$golangci_lint" run)
done
