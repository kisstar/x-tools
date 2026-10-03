#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tracked_before=$(mktemp)
tracked_after=$(mktemp)
untracked_before=$(mktemp)
untracked_after=$(mktemp)
cleanup() { rm -f "$tracked_before" "$tracked_after" "$untracked_before" "$untracked_after"; }
trap cleanup EXIT INT TERM

(cd "$repo_root" && git diff --binary -- contracts/schema packages/contracts/src/generated.ts >"$tracked_before" && git ls-files --others --exclude-standard -- contracts/schema packages/contracts/src/generated.ts | sort >"$untracked_before")
(cd "$repo_root" && env GOCACHE=/tmp/xtools-go-cache GOMODCACHE=/tmp/xtools-go-modcache go run ./go/modules/preferences/cmd/codegen)
(cd "$repo_root" && git diff --binary -- contracts/schema packages/contracts/src/generated.ts >"$tracked_after" && git ls-files --others --exclude-standard -- contracts/schema packages/contracts/src/generated.ts | sort >"$untracked_after")

cmp "$tracked_before" "$tracked_after"
cmp "$untracked_before" "$untracked_after"
