#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
PROJECT_ROOT_LOWER="$(printf '%s' "${PROJECT_ROOT}" | tr '[:upper:]' '[:lower:]')"
RUNTIME_DIR="${IMS_WEB_RUNTIME_DIR:-${PROJECT_ROOT}/packages/server/runtime}"
PORT=9092
OPEN_RESET_URL=0
START_DEV=0
RESET_URL="${IMS_WEB_RESET_URL:-http://127.0.0.1:9091/?ims-reset-state=1}"

log() {
  printf '[reset-web-state] %s\n' "$*"
}

usage() {
  cat <<'EOF'
用法:
  bash ./scripts/reset-web-state.sh [选项]

选项:
  --open       重置后自动打开 Web 重置链接（会清理 localStorage）
  --start-dev  重置完成后自动启动完整 Web 链路（server + ui）
  --help       显示帮助

说明:
  该脚本用于 Web 模式初始化测试：
  1) 清理 packages/server/runtime 下数据库与运行态数据
  2) 尝试释放本地 9092 端口（仅 IMS 相关进程）
  3) 可选打开带 ?ims-reset-state=1 的页面，清理浏览器本地缓存
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --open)
        OPEN_RESET_URL=1
        shift
        ;;
      --start-dev)
        START_DEV=1
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
}

should_kill_pid() {
  local pid="$1"
  local command_text
  command_text="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  local lower_command
  lower_command="$(printf '%s' "${command_text}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${lower_command}" == *"${PROJECT_ROOT_LOWER}/packages/server"* ]]; then
    return 0
  fi
  if [[ "${lower_command}" == *"${PROJECT_ROOT_LOWER}"* && "${lower_command}" == *"/dist/server"* ]]; then
    return 0
  fi
  if [[ "${lower_command}" == *"${PROJECT_ROOT_LOWER}"* && "${lower_command}" == *"bun"* && "${lower_command}" == *"src/index.ts"* ]]; then
    return 0
  fi

  return 1
}

terminate_pid() {
  local pid="$1"
  kill -TERM "${pid}" 2>/dev/null || true
  sleep 0.5
  if kill -0 "${pid}" 2>/dev/null; then
    kill -KILL "${pid}" 2>/dev/null || true
  fi
}

release_port_9092() {
  if ! command -v lsof >/dev/null 2>&1; then
    log "未找到 lsof，跳过端口 ${PORT} 清理"
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
      terminate_pid "${pid}"
      log "已结束占用 ${PORT} 的 web/server 进程 pid=${pid}"
    else
      log "检测到非 web/server 进程占用 ${PORT}，跳过 pid=${pid}"
    fi
  done <<< "${pids}"
}

clean_runtime() {
  if [[ ! -d "${RUNTIME_DIR}" ]]; then
    log "runtime 目录不存在，跳过: ${RUNTIME_DIR}"
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

  log "web runtime 数据已清理: ${RUNTIME_DIR}"
}

open_reset_url_if_needed() {
  if [[ "${OPEN_RESET_URL}" -ne 1 ]]; then
    return
  fi
  if ! command -v open >/dev/null 2>&1; then
    log "未找到 open 命令，请手动打开: ${RESET_URL}"
    return
  fi

  if open "${RESET_URL}"; then
    log "已打开重置链接: ${RESET_URL}"
  else
    log "打开重置链接失败，请手动打开: ${RESET_URL}"
  fi
}

main() {
  parse_args "$@"
  log "开始重置 Web 初始化状态"
  log "本脚本仅处理 web/server，不会触发 desktop 清理逻辑"
  release_port_9092
  clean_runtime
  open_reset_url_if_needed

  log "重置完成"

  if [[ "${START_DEV}" -eq 1 ]]; then
    log "准备启动完整 Web 链路: pnpm dev:web"
    (
      cd "${PROJECT_ROOT}"
      exec pnpm dev:web
    )
  fi

  log "下一步可执行:"
  log "  pnpm dev:server"
  log "  pnpm dev:ui"
  log "  pnpm dev:web"
  log "  pnpm dev:reset-web-file"
  log "  open \"${RESET_URL}\""
}

main "$@"
