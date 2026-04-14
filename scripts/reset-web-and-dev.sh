#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
SERVER_HEALTH_URL="${IMS_SERVER_HEALTH_URL:-http://127.0.0.1:9092/api/health}"
SERVER_WAIT_SECONDS="${IMS_SERVER_WAIT_SECONDS:-30}"
SERVER_PID=""

log() {
  printf '[reset-web] %s\n' "$*"
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

wait_server_health() {
  local attempts
  attempts=$((SERVER_WAIT_SECONDS * 2))

  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS --max-time 2 "${SERVER_HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      return 1
    fi
    sleep 0.5
  done
  return 1
}

main() {
  trap cleanup EXIT INT TERM

  log "1/3 清理 Web 初始化状态"
  bash "${SCRIPT_DIR}/reset-web-state.sh"

  log "2/3 启动 Server (pnpm dev:server)"
  (
    cd "${PROJECT_ROOT}"
    pnpm dev:server
  ) &
  SERVER_PID="$!"

  if ! wait_server_health; then
    log "Server 启动失败或健康检查超时: ${SERVER_HEALTH_URL}"
    exit 1
  fi
  log "Server 已就绪"

  log "3/3 启动 Web (pnpm dev)"
  (
    cd "${PROJECT_ROOT}"
    pnpm dev
  )
}

main "$@"
