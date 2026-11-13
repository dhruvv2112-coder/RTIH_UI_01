#!/usr/bin/env sh
# Pushkaralu 2027 Suite — macOS / Linux launcher
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required: https://nodejs.org/en/download (or: brew install node)"
  exit 1
fi
exec node server.mjs --open
