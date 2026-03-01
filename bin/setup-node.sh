#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" > /dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" > /dev/null 2>&1 && pwd)"
CHIP_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"

. "$HOME/.nvm/nvm.sh"
nvm use 24
export PNPM_HOME="$HOME/.local/share/pnpm"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "PNPM_HOME=$PNPM_HOME" >> "$GITHUB_ENV"
fi
if [[ -n "${GITHUB_PATH:-}" ]]; then
  node_bin="$(nvm which node)"
  bin_dir=$(dirname "$node_bin")
  echo "$bin_dir" >> "$GITHUB_PATH"
  echo "$PNPM_HOME" >> "$GITHUB_PATH"
fi

cd "${CHIP_PATH}"
pnpm install --frozen-lockfile --prefer-offline

if [[ -n "${GITHUB_PATH:-}" ]]; then
  turbo_bin="$(realpath "$(pnpm which turbo 2>/dev/null | tail -n1 | xargs realpath)")"
  bin_dir=$(dirname "$turbo_bin")
  echo "$bin_dir" >> "$GITHUB_PATH"
fi
