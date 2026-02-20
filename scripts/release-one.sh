#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-patch}"

if ! [[ "$TARGET" =~ ^(patch|minor|major|[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "Usage: ./scripts/release-one.sh [patch|minor|major|x.y.z]"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash changes first."
  exit 1
fi

echo "Running CI..."
bun run ci

echo "Bumping version: $TARGET"
npm version "$TARGET" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

echo "Committing + tagging ${TAG}"
git add package.json bun.lock
git commit -m "Release ${TAG}"
git tag "${TAG}"

echo "Pushing commit + tag"
git push origin HEAD
git push origin "${TAG}"

echo "Waiting for GitHub release workflow (${TAG})..."
RUN_ID=""
for _ in {1..20}; do
  RUN_ID="$(gh run list --workflow release.yml --limit 30 --json databaseId,displayTitle --jq "map(select(.displayTitle == \"Release ${TAG}\"))[0].databaseId" || true)"
  if [[ -n "${RUN_ID}" && "${RUN_ID}" != "null" ]]; then
    break
  fi
  sleep 3
done

if [[ -z "${RUN_ID}" || "${RUN_ID}" == "null" ]]; then
  echo "Release run not found yet. Check manually:"
  echo "https://github.com/henryoman/pump-kit/actions/workflows/release.yml"
  exit 1
fi

gh run watch "${RUN_ID}" --exit-status
echo "Release completed: ${TAG}"
