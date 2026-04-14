#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"

APP_SUPPORT_DIR="${HOME}/Library/Application Support/com.company.interview-manager"
LOG_DIR="${APP_SUPPORT_DIR}/logs"
RUNTIME_DIR="${PROJECT_ROOT}/runtime"
WEBKIT_STORAGE_DIR="${HOME}/Library/WebKit/com.company.interview-manager"
WEBKIT_CACHE_DIR="${HOME}/Library/Caches/com.company.interview-manager"
PREFS_FILE="${HOME}/Library/Preferences/com.company.interview-manager.plist"
APP_NAME="IMS.app"
BUILD_APP_PATH="${PROJECT_ROOT}/apps/desktop/target/release/bundle/macos/${APP_NAME}"
INSTALL_APP_PATH="/Applications/${APP_NAME}"
PORT=9092
DO_BUILD=0
DO_INSTALL=0
DO_OPEN_LOGS=0

log() {
  printf '[reset-desktop-state] %s\n' "$*"
}

usage() {
  cat <<'EOF'
用法:
  bash ./scripts/reset-desktop-state.sh [选项]

选项:
  --with-build    重置后自动构建桌面包（pnpm build:desktop:local）
  --with-install  重置后自动安装到 /Applications/IMS.app（隐含 --with-build）
  --open-logs     重置后打开日志目录
  --full          等价于 --with-build --with-install --open-logs
  --help          显示帮助
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-build)
        DO_BUILD=1
        shift
        ;;
      --with-install)
        DO_INSTALL=1
        shift
        ;;
      --open-logs)
        DO_OPEN_LOGS=1
        shift
        ;;
      --full)
        DO_BUILD=1
        DO_INSTALL=1
        DO_OPEN_LOGS=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        log "未知参数: $1"
        usage
        exit 1
        ;;
    esac
  done

  if [[ "${DO_INSTALL}" -eq 1 ]]; then
    DO_BUILD=1
  fi
}

should_kill_pid() {
  local pid="$1"
  local command_text
  command_text="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  local lower_command
  lower_command="$(printf '%s' "${command_text}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${lower_command}" == *"interview-manager"* ]]; then
    return 0
  fi
  if [[ "${lower_command}" == *"/ims.app/"* ]]; then
    return 0
  fi
  if [[ "${lower_command}" == *"/packages/server/dist/server"* ]]; then
    return 0
  fi
  if [[ "${lower_command}" == *"/dist/server"* ]]; then
    return 0
  fi

  return 1
}

release_port_9092() {
  if ! command -v lsof >/dev/null 2>&1; then
    log "未找到 lsof，跳过端口 ${PORT} 进程清理"
    return
  fi

  local pids
  pids="$(lsof -nP -t -iTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    log "端口 ${PORT} 当前未被占用"
    return
  fi

  local pid
  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    if should_kill_pid "${pid}"; then
      kill -9 "${pid}" 2>/dev/null || true
      log "已结束占用 ${PORT} 的 IMS 相关进程 pid=${pid}"
    else
      log "检测到非 IMS 进程占用 ${PORT}，跳过 pid=${pid}"
    fi
  done <<< "${pids}"
}

clean_repo_runtime() {
  if [[ ! -d "${RUNTIME_DIR}" ]]; then
    log "仓库 runtime 目录不存在，跳过"
    return
  fi

  rm -rf \
    "${RUNTIME_DIR}/agent-workspaces" \
    "${RUNTIME_DIR}/data" \
    "${RUNTIME_DIR}/files" \
    "${RUNTIME_DIR}/logs"

  find "${RUNTIME_DIR}" -maxdepth 1 -type f \
    \( -name '*.db' -o -name '*.db-*' -o -name '*.sqlite' -o -name '*.sqlite-*' -o -name '*.log' \) \
    -exec rm -f {} +

  log "仓库 runtime 数据已清理"
}

clean_desktop_app_support() {
  if [[ -d "${APP_SUPPORT_DIR}" ]]; then
    rm -rf "${APP_SUPPORT_DIR}"
    log "桌面端 App Support 数据已清理: ${APP_SUPPORT_DIR}"
  else
    log "未发现 App Support 目录，跳过: ${APP_SUPPORT_DIR}"
  fi
}

clean_webview_storage() {
  rm -rf "${WEBKIT_STORAGE_DIR}" "${WEBKIT_CACHE_DIR}"
  rm -f "${PREFS_FILE}"
  log "WebView 本地存储已清理（主题/本地缓存会重置）"
}

clean_test_artifacts() {
  rm -rf \
    "${PROJECT_ROOT}/playwright-report" \
    "${PROJECT_ROOT}/test-results"
  log "测试产物已清理（playwright-report / test-results）"
}

build_desktop_bundle() {
  if ! command -v pnpm >/dev/null 2>&1; then
    log "未找到 pnpm，无法自动构建"
    exit 1
  fi

  log "开始构建桌面安装包（app bundle）"
  (
    cd "${PROJECT_ROOT}"
    pnpm build
    pnpm --filter @ims/desktop tauri build --config tauri.local.conf.json --no-sign --bundles app
  )
  log "构建完成: ${BUILD_APP_PATH}"
}

install_desktop_app() {
  if [[ ! -d "${BUILD_APP_PATH}" ]]; then
    log "未找到构建产物: ${BUILD_APP_PATH}"
    exit 1
  fi

  rm -rf "${INSTALL_APP_PATH}" || true
  /usr/bin/ditto "${BUILD_APP_PATH}" "${INSTALL_APP_PATH}"
  log "已安装桌面应用: ${INSTALL_APP_PATH}"
}

open_logs_dir() {
  mkdir -p "${LOG_DIR}"
  if command -v open >/dev/null 2>&1; then
    open "${LOG_DIR}" || true
  fi
  log "日志目录: ${LOG_DIR}"
}

main() {
  parse_args "$@"

  log "开始执行桌面端一键重置"
  release_port_9092
  clean_repo_runtime
  clean_desktop_app_support
  clean_webview_storage
  clean_test_artifacts

  if [[ "${DO_BUILD}" -eq 1 ]]; then
    build_desktop_bundle
  fi

  if [[ "${DO_INSTALL}" -eq 1 ]]; then
    install_desktop_app
  fi

  if [[ "${DO_OPEN_LOGS}" -eq 1 ]]; then
    open_logs_dir
  fi

  log "重置完成"
  log "常用命令:"
  log "  pnpm reset:desktop-state"
  log "  pnpm reset:desktop-full"
  log "  pnpm desktop:logs:open"
}

main "$@"
