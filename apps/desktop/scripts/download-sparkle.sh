#!/bin/bash
set -euo pipefail

VERSION="2.8.1"
EXPECTED_SHA256="5cddb7695674ef7704268f38eccaee80e3accbf19e61c1689efff5b6116d85be"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMP_DIR="$(mktemp -d)"

trap 'rm -rf "${TEMP_DIR}"' EXIT

if [ -d "${APP_DIR}/Sparkle.framework" ]; then
  exit 0
fi

curl -L -o "${TEMP_DIR}/sparkle.tar.xz" \
  "https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz"

echo "${EXPECTED_SHA256}  ${TEMP_DIR}/sparkle.tar.xz" | shasum -a 256 -c -
tar -xf "${TEMP_DIR}/sparkle.tar.xz" -C "${TEMP_DIR}"
cp -R "${TEMP_DIR}/Sparkle.framework" "${APP_DIR}/Sparkle.framework"

mkdir -p "${APP_DIR}/sparkle-bin"
if [ -d "${TEMP_DIR}/bin" ]; then
  cp -R "${TEMP_DIR}/bin/." "${APP_DIR}/sparkle-bin"
  chmod +x "${APP_DIR}/sparkle-bin"/*
fi

printf 'Sparkle.framework ready at %s\n' "${APP_DIR}/Sparkle.framework"
