#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -x ./pocketbase ]; then
  echo "PocketBase is not installed. Run ./setup.sh first." >&2
  exit 1
fi

HOST="${PB_HOST:-0.0.0.0}"
PORT="${PB_PORT:-8090}"

if [ "${HOST}" = "0.0.0.0" ]; then
  echo "PocketBase is listening on all interfaces so phones on the LAN can connect."
  echo "This is a development server; set PB_HOST=127.0.0.1 to keep it local-only."
fi

exec ./pocketbase serve --http="${HOST}:${PORT}" \
  --dir=./pb_data \
  --migrationsDir=./pb_migrations \
  --hooksDir=./pb_hooks
