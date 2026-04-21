#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"

APP_NAME="IMS.app"
BUILD_APP_PATH="${PROJECT_ROOT}/apps/desktop/target/release/bundle/macos/${APP_NAME}"
INSTALL_APP_PATH="/Applications/${APP_NAME}"
LOG_DIR="${HOME}/Library/Application Support/com.company.interview-manager/logs"

log() {
  printf '[desktop-reinstall] %s\n' "$*"
}

if ! command -v pnpm >/dev/null 2>&1; then
  log "未找到 pnpm，无法构建桌面包"
  exit 1
fi

log "开始构建桌面安装包（app bundle）"
(
  cd "${PROJECT_ROOT}"
  pnpm build:web
  pnpm --filter @ims/desktop tauri build --config tauri.local.conf.json --no-sign --bundles app
)

if [[ ! -d "${BUILD_APP_PATH}" ]]; then
  log "未找到构建产物: ${BUILD_APP_PATH}"
  exit 1
fi

rm -rf "${INSTALL_APP_PATH}" || true
/usr/bin/ditto "${BUILD_APP_PATH}" "${INSTALL_APP_PATH}"
log "已安装桌面应用: ${INSTALL_APP_PATH}"

mkdir -p "${LOG_DIR}"
if command -v open >/dev/null 2>&1; then
  open "${LOG_DIR}" || true
fi
log "日志目录: ${LOG_DIR}"

log "完成。可执行：open /Applications/IMS.app"
