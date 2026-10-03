#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-/tmp/xtools-go-cache}"
export GOMODCACHE="${GOMODCACHE:-/tmp/xtools-go-modcache}"
export GOLANGCI_LINT_CACHE="${GOLANGCI_LINT_CACHE:-/tmp/xtools-golangci-lint-cache}"
bootstrap=$repo_root/go.work.bootstrap
tool_bin=${XTOOLS_TOOL_BIN:-/private/tmp/xtools-tools}
golangci_lint=$tool_bin/golangci-lint

if [ ! -x "$golangci_lint" ]; then
  printf '%s\n' "golangci-lint v2.14.0 不可用；请运行 GOBIN=$tool_bin go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0" >&2
  exit 1
fi

find "$repo_root" -name go.mod -not -path '*/node_modules/*' -not -path '*/.git/*' -print | sort | while IFS= read -r module_file; do
  module_dir=$(dirname "$module_file")
  temporary_stem=$(mktemp "$module_dir/bootstrap.XXXXXX")
  temporary_mod=$temporary_stem.mod
  temporary_sum=$temporary_stem.sum
  temporary_config=$module_dir/.golangci.bootstrap.yml
  temporary_lint_dir=$(mktemp -d)
  cleanup() {
    rm -rf "$temporary_lint_dir"
    rm -f "$temporary_stem" "$temporary_mod" "$temporary_sum" "$temporary_config" "$temporary_mod.normalized" "$temporary_mod.official"
  }
  trap cleanup EXIT INT TERM

  mv "$temporary_stem" "$temporary_mod"
  cp "$module_file" "$temporary_mod"
  cp "$repo_root/.golangci.yml" "$temporary_config"
  while IFS= read -r line; do
    case "$line" in
      replace*)
        module_path=$(printf '%s\n' "$line" | awk '{print $2}')
        relative_target=$(printf '%s\n' "$line" | awk '{print $4}')
        absolute_target=$repo_root/${relative_target#./}
        (cd "$module_dir" && env GOWORK=off go mod edit -modfile="$temporary_mod" -replace="$module_path=$absolute_target")
        ;;
    esac
  done <"$bootstrap"

  (cd "$module_dir" && env GOWORK=off go mod tidy -modfile="$temporary_mod" && env GOWORK=off go vet -modfile="$temporary_mod" ./... && env GOWORK=off go test -modfile="$temporary_mod" ./...)
  cp -R "$module_dir/." "$temporary_lint_dir"
  cp "$temporary_mod" "$temporary_lint_dir/go.mod"
  if [ -f "$temporary_sum" ]; then cp "$temporary_sum" "$temporary_lint_dir/go.sum"; fi
  (cd "$temporary_lint_dir" && env GOWORK=off "$golangci_lint" run --config "$temporary_config")
  while IFS= read -r line; do
    case "$line" in
      replace*)
        module_path=$(printf '%s\n' "$line" | awk '{print $2}')
        (cd "$module_dir" && env GOWORK=off go mod edit -modfile="$temporary_mod" -dropreplace="$module_path")
        ;;
    esac
  done <"$bootstrap"
  grep -Ev 'github.com/kisstar/x-tools/|^[[:space:]]*require \($|^[[:space:]]*\)[[:space:]]*$' "$temporary_mod" >"$temporary_mod.normalized"
  grep -Ev 'github.com/kisstar/x-tools/|^[[:space:]]*require \($|^[[:space:]]*\)[[:space:]]*$' "$module_file" >"$temporary_mod.official"
  cmp "$temporary_mod.normalized" "$temporary_mod.official"
  rm -f "$temporary_mod.normalized" "$temporary_mod.official"
  cleanup
  trap - EXIT INT TERM
done
