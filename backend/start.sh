#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -x ./pocketbase ]; then
  echo "PocketBase is not installed. Run ./setup.sh first." >&2
  exit 1
fi

HOST="${PB_HOST:-127.0.0.1}"
PORT="${PB_PORT:-8090}"

exec ./pocketbase serve --http="${HOST}:${PORT}" \
  --dir=./pb_data \
  --migrationsDir=./pb_migrations \
  --hooksDir=./pb_hooks
