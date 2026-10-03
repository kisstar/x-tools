#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-/tmp/xtools-go-cache}"
export GOMODCACHE="${GOMODCACHE:-/tmp/xtools-go-modcache}"
export GOLANGCI_LINT_CACHE="${GOLANGCI_LINT_CACHE:-/tmp/xtools-golangci-lint-cache}"
tool_bin=${XTOOLS_TOOL_BIN:-/private/tmp/xtools-tools}
golangci_lint=$tool_bin/golangci-lint
all_files=false

if [ ! -x "$golangci_lint" ]; then
  printf '%s\n' "golangci-lint v2.14.0 不可用；请运行 GOBIN=$tool_bin go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  all_files=true
  # Repository-controlled Go paths do not contain whitespace.
  # shellcheck disable=SC2046
  set -- $(find "$repo_root" -name '*.go' -not -path '*/node_modules/*' -not -path '*/.git/*' -print)
fi

"$golangci_lint" fmt --diff --config "$repo_root/.golangci.yml" "$@"

if [ "$all_files" = true ]; then
  work_before=$(mktemp)
  work_after=$(mktemp)
  cleanup() { rm -f "$work_before" "$work_after"; }
  trap cleanup EXIT INT TERM
  cp "$repo_root/go.work" "$work_before"
  (cd "$repo_root" && go work edit -fmt)
  cp "$repo_root/go.work" "$work_after"
  cp "$work_before" "$repo_root/go.work"
  cmp "$work_before" "$work_after"

  find "$repo_root" -name go.mod -not -path '*/node_modules/*' -not -path '*/.git/*' -print | while IFS= read -r module_file; do
    before=$(mktemp)
    cp "$module_file" "$before"
    (cd "$(dirname "$module_file")" && env GOWORK=off go mod edit -fmt)
    if ! cmp "$before" "$module_file"; then
      cp "$before" "$module_file"
      rm -f "$before"
      exit 1
    fi
    cp "$before" "$module_file"
    rm -f "$before"
  done
fi
