#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export GOCACHE=${GOCACHE:-/tmp/xtools-go-cache}
export GOMODCACHE=${GOMODCACHE:-/tmp/xtools-go-modcache}
bootstrap=$repo_root/go.work.bootstrap

find "$repo_root" -name go.mod -not -path '*/node_modules/*' -not -path '*/.git/*' -print | sort | while IFS= read -r module_file; do
  module_dir=$(dirname "$module_file")
  temporary_stem=$(mktemp "$module_dir/bootstrap.XXXXXX")
  temporary_mod=$temporary_stem.mod
  temporary_sum=$temporary_stem.sum
  cleanup() { rm -f "$temporary_stem" "$temporary_mod" "$temporary_sum" "$temporary_mod.normalized" "$temporary_mod.official"; }
  trap cleanup EXIT INT TERM

  mv "$temporary_stem" "$temporary_mod"
  cp "$module_file" "$temporary_mod"
  while IFS= read -r line; do
    case "$line" in
      replace*)
        module_path=$(printf '%s\n' "$line" | awk '{print $2}')
        relative_target=$(printf '%s\n' "$line" | awk '{print $4}')
        absolute_target=$repo_root/${relative_target#./}
        (cd "$module_dir" && env GOWORK=off go mod edit -modfile="$temporary_mod" -replace="$module_path=$absolute_target")
        ;;
    esac
  done < "$bootstrap"

  (cd "$module_dir" && env GOWORK=off go mod tidy -modfile="$temporary_mod" && env GOWORK=off go test -modfile="$temporary_mod" ./...)
  while IFS= read -r line; do
    case "$line" in
      replace*)
        module_path=$(printf '%s\n' "$line" | awk '{print $2}')
        (cd "$module_dir" && env GOWORK=off go mod edit -modfile="$temporary_mod" -dropreplace="$module_path")
        ;;
    esac
  done < "$bootstrap"
  grep -Ev 'github.com/kisstar/x-tools/|^[[:space:]]*require \($|^[[:space:]]*\)[[:space:]]*$' "$temporary_mod" > "$temporary_mod.normalized"
  grep -Ev 'github.com/kisstar/x-tools/|^[[:space:]]*require \($|^[[:space:]]*\)[[:space:]]*$' "$module_file" > "$temporary_mod.official"
  cmp "$temporary_mod.normalized" "$temporary_mod.official"
  rm -f "$temporary_mod.normalized" "$temporary_mod.official"
  cleanup
  trap - EXIT INT TERM
done
