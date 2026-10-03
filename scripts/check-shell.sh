#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- scripts/*.sh
fi

shellcheck_bin=${XTOOLS_SHELLCHECK:-shellcheck}
if ! command -v "$shellcheck_bin" >/dev/null 2>&1; then
  printf '%s\n' 'ShellCheck 0.11.0 不可用；请在开发机或 CI 镜像中安装该固定版本。' >&2
  exit 1
fi
"$shellcheck_bin" --shell=sh --exclude=SC1007 -- "$@"
