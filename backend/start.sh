#!/usr/bin/env bash
# Starts the BiteN Go API. Run from anywhere:  bash backend/start.sh
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example. Edit it with your PostgreSQL password!"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "Installing backend dependencies…"
  npm install
fi

if [ ! -x cpp/build/biten_engine ]; then
  echo "Building the C++ engine…"
  bash cpp/build.sh || echo "C++ build failed — the API will use the TypeScript fallback."
fi

npm run dev
