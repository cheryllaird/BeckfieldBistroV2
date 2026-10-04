#!/usr/bin/env bash
# Installs dependencies in Claude Code cloud sessions (including scheduled
# Routines) so agents can run lint, typecheck, tests and build straight away.
# Local sessions are left alone.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}"
[ -d node_modules ] && exit 0
npm ci --no-audit --no-fund >&2
