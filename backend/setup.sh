#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

VERSION="${POCKETBASE_VERSION:-0.40.5}"

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "Unsupported OS: $(uname -s). Download PocketBase manually." >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)." >&2; exit 1 ;;
esac

if [ ! -x ./pocketbase ]; then
  echo "Downloading PocketBase ${VERSION} (${os}_${arch})..."
  tmp="$(mktemp -d)"
  curl -fsSL -o "${tmp}/pb.zip" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${os}_${arch}.zip"
  unzip -o "${tmp}/pb.zip" pocketbase -d . >/dev/null
  rm -rf "${tmp}"
  chmod +x ./pocketbase
fi

mkdir -p pb_data

ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@openservices.local}"
ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:-devpassword}"

./pocketbase superuser upsert "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}"

cat <<EOF

PocketBase ${VERSION} is ready.

  Admin:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  Start:  ./start.sh
  Seed:   node seed.mjs   (in another terminal, after the server starts)

Set PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD to override the local defaults.
EOF
