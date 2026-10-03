#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

pnpm install --frozen-lockfile --ignore-scripts
pnpm exec turbo run build --dry=json >/dev/null
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm codegen:check
sh scripts/test-go-workspace.sh
sh scripts/verify-go-modules.sh
pnpm mermaid:check
pnpm security
pnpm test:race
pnpm e2e
