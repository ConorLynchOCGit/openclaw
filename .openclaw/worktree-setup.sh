#!/bin/sh
set -eu

if [ ! -f package.json ] || [ ! -f pnpm-lock.yaml ]; then
  echo "OpenClaw worktree setup requires package.json and pnpm-lock.yaml" >&2
  exit 1
fi

expected_package_manager=$(node -p 'require("./package.json").packageManager || ""')
case "$expected_package_manager" in
  pnpm@*)
    expected_pnpm_version=${expected_package_manager#pnpm@}
    expected_pnpm_version=${expected_pnpm_version%%+*}
    ;;
  *)
    echo "OpenClaw worktree setup requires a pinned pnpm packageManager" >&2
    exit 1
    ;;
esac

actual_pnpm_version=$(pnpm --version)
if [ "$actual_pnpm_version" != "$expected_pnpm_version" ]; then
  echo "pnpm version mismatch: expected $expected_pnpm_version, got $actual_pnpm_version" >&2
  exit 1
fi

CI=1 pnpm install --frozen-lockfile --prefer-offline

for binary in node_modules/.bin/tsgo node_modules/.bin/vitest; do
  if [ ! -x "$binary" ]; then
    echo "worktree setup did not install $binary" >&2
    exit 1
  fi
done

cache_probe=.artifacts/openclaw-worktree-setup-write-probe
mkdir -p "$(dirname "$cache_probe")"
printf "ok\n" > "$cache_probe"
rm -f "$cache_probe"
