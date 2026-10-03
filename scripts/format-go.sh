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
"$golangci_lint" fmt --config "$repo_root/.golangci.yml"
go work edit -fmt
find "$repo_root" -name go.mod -not -path '*/node_modules/*' -not -path '*/.git/*' -print | while IFS= read -r module_file; do
  (cd "$(dirname "$module_file")" && env GOWORK=off go mod edit -fmt)
done
