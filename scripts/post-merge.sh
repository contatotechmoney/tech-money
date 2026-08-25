#!/usr/bin/env bash
set -euo pipefail

if [[ -f package-lock.json ]]; then
  npm ci --ignore-scripts
else
  npm install --ignore-scripts
fi

npm run check
npm run build