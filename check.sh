#!/usr/bin/env bash
# Runs every CI check; exits non-zero on the first failure.
set -euo pipefail
pnpm lint >/dev/null
pnpm format:check >/dev/null
pnpm typecheck >/dev/null
pnpm test 2>&1 | grep -E "Tests "
pnpm build >/dev/null
pnpm --filter demo typecheck >/dev/null
echo "all checks passed"
