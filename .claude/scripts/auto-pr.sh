#!/usr/bin/env bash
# Runs after every Claude Code session via Stop hook.
# Pushes the current branch, creates a PR if needed, enables auto-merge.

set -euo pipefail

export PATH="$PATH:/c/Program Files/GitHub CLI:/c/Users/Cheryl/AppData/Local/Programs/GitHub CLI"
export MSYS_NO_PATHCONV=1

# Guard: skip if on main/master
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [[ -z "$CURRENT_BRANCH" || "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
  echo "[auto-pr] On protected branch '$CURRENT_BRANCH' — skipping."
  exit 0
fi

# Guard: skip if no commits to push
if git ls-remote --exit-code origin "$CURRENT_BRANCH" > /dev/null 2>&1; then
  COMMITS_AHEAD=$(git rev-list --count "origin/${CURRENT_BRANCH}..HEAD" 2>/dev/null || echo "0")
else
  COMMITS_AHEAD=$(git rev-list --count HEAD 2>/dev/null || echo "0")
fi
if [[ "$COMMITS_AHEAD" -eq 0 ]]; then
  echo "[auto-pr] No unpushed commits — skipping."
  exit 0
fi

# Push branch
echo "[auto-pr] Pushing '$CURRENT_BRANCH'..."
git push --set-upstream origin "$CURRENT_BRANCH"

# Create PR if none exists
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base main --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
if [[ -z "$EXISTING_PR" ]]; then
  echo "[auto-pr] Creating PR..."
  gh pr create --base main --head "$CURRENT_BRANCH" --fill
else
  echo "[auto-pr] PR #${EXISTING_PR} already exists."
fi

# Enable auto-merge (squash) — merges automatically after approval
echo "[auto-pr] Enabling auto-merge..."
gh pr merge "$CURRENT_BRANCH" --auto --squash

echo "[auto-pr] Done. PR queued for auto-merge after approval."
