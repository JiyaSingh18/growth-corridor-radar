#!/usr/bin/env bash
# Build the static site and publish it to the gh-pages branch (served by GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/../web"
npm ci && npm run build
touch dist/.nojekyll && cp dist/index.html dist/404.html
cd dist
git init -q -b gh-pages && git add -A && git commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$(git -C ../.. remote get-url origin)" gh-pages
rm -rf .git
