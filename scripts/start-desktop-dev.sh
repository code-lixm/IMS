#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
APP_SUPPORT_DIR="${HOME}/Library/Application Support/com.company.interview-manager"
RUNTIME_DIR="${APP_SUPPORT_DIR}/runtime"
DATA_DIR="${RUNTIME_DIR}/data"
FILES_DIR="${RUNTIME_DIR}/files"
AGENT_WORKSPACES_DIR="${RUNTIME_DIR}/agent-workspaces"
DB_PATH="${RUNTIME_DIR}/interview.db"
DB_QUARANTINE_DIR="${RUNTIME_DIR}/quarantine"
SERVER_PORT="${IMS_PORT:-9092}"
SERVER_HEALTH_URL="${IMS_SERVER_HEALTH_URL:-}"
SERVER_WAIT_SECONDS="${IMS_SERVER_WAIT_SECONDS:-30}"
SERVER_START_RETRIES="${IMS_SERVER_START_RETRIES:-2}"
SERVER_PID=""
REUSE_EXISTING_SERVER="0"

log() {
  printf '[dev:desktop] %s\n' "$*"
}

cleanup() {
  if [[ "${REUSE_EXISTING_SERVER}" != "1" && -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    terminate_pid "${SERVER_PID}"
  fi
}

terminate_pid() {
  local pid="$1"
  kill -TERM "${pid}" >/dev/null 2>&1 || true
  sleep 0.5
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill -KILL "${pid}" >/dev/null 2>&1 || true
  fi
}

quarantine_desktop_db_files() {
  local reason="${1:-unknown}"
  local timestamp
  timestamp="$(date +%Y%m%d%H%M%S)"
  local destination="${DB_QUARANTINE_DIR}/${timestamp}-${reason}"
  local moved="0"
  local file

  mkdir -p "${destination}"
  for file in "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm"; do
    if [[ -e "${file}" ]]; then
      mv "${file}" "${destination}/" 2>/dev/null || rm -f "${file}" 2>/dev/null || true
      moved="1"
    fi
  done

  if [[ "${moved}" == "1" ]]; then
    log "已隔离可能损坏的 Desktop SQLite 文件: ${destination}"
  else
    rmdir "${destination}" 2>/dev/null || true
  fi
}

cleanup_orphan_sqlite_sidecars() {
  if [[ ! -e "${DB_PATH}" ]]; then
    rm -f "${DB_PATH}-wal" "${DB_PATH}-shm" 2>/dev/null || true
  fi
}

health_url_for_port() {
  printf 'http://127.0.0.1:%s/api/health' "$1"
}

is_ims_server_healthy() {
  curl -fsS --max-time 2 "$(health_url_for_port "$1")" >/dev/null 2>&1
}

release_stale_ims_server_on_port() {
  local port="$1"
  local released="0"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "${pids}" ]]; then
    return 1
  fi

  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    local command_text
    command_text="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
    if [[ "${command_text}" == *"${PROJECT_ROOT}/packages/server"* ]] || [[ "${command_text}" == *"@ims/server"* ]] || [[ "${command_text}" == *"packages/server/src/index.ts"* ]]; then
      log "释放残留 IMS server: port=${port} pid=${pid}"
      terminate_pid "${pid}"
      released="1"
    fi
  done <<< "${pids}"

  [[ "${released}" == "1" ]]
}

is_gitbash() {
  [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]
}

# 通过 netstat 获取占用端口进程 PID（Git Bash / Windows）
port_pid_from_netstat() {
  local port="$1"
  netstat -ano 2>/dev/null | grep ":${port} " | awk '{print $NF}' | head -1 | grep -E '^[0-9]+$' || true
}

# 通过 taskkill 杀 Windows 进程
kill_pid_windows() {
  local pid="$1"
  taskkill //PID "${pid}" //F >/dev/null 2>&1 || true
}

release_stale_vite_on_port() {
  local port="$1"
  local pid=""

  # macOS / Linux: lsof
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -nP -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    if [[ -n "${pid}" ]]; then
      local cmd
      cmd="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
      if [[ "${cmd}" == *"vite"* ]]; then
        log "释放残留 Vite 进程 (lsof): port=${port} pid=${pid}"
        kill -TERM "${pid}" 2>/dev/null || true
        sleep 0.5
        kill -0 "${pid}" 2>/dev/null && kill -KILL "${pid}" 2>/dev/null || true
        return 0
      fi
    fi
  # Windows Git Bash: netstat + taskkill
  elif is_gitbash; then
    pid="$(port_pid_from_netstat "${port}")"
    if [[ -n "${pid}" ]]; then
      log "释放占用端口 ${port} 的进程 (netstat): pid=${pid}"
      kill_pid_windows "${pid}"
      return 0
    fi
  fi

  # 无法检测或无需清理：静默通过
  return 0
}

choose_server_port() {
  local requested_port="${SERVER_PORT}"

  for port in $(seq "${requested_port}" 9112); do
    if is_ims_server_healthy "${port}"; then
      REUSE_EXISTING_SERVER="1"
      SERVER_PORT="${port}"
      return 0
    fi

    if release_stale_ims_server_on_port "${port}"; then
      sleep 0.3
    fi

    if ! lsof -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      SERVER_PORT="${port}"
      return 0
    fi

    log "端口 ${port} 被非 IMS 进程占用，尝试下一个端口"
  done

  log "未找到可用 Server 端口: ${requested_port}..9112"
  return 1
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

start_desktop_server() {
  log "1/2 启动 Desktop Server (App Support runtime, port=${SERVER_PORT})"
  (
    cd "${PROJECT_ROOT}"
    IMS_ROOT_DIR="${APP_SUPPORT_DIR}" \
    IMS_RUNTIME_DIR="${RUNTIME_DIR}" \
    IMS_DATA_DIR="${DATA_DIR}" \
    IMS_FILES_DIR="${FILES_DIR}" \
    IMS_AGENT_WORKSPACES_DIR="${AGENT_WORKSPACES_DIR}" \
    IMS_DB_PATH="${DB_PATH}" \
    IMS_PORT="${SERVER_PORT}" \
    pnpm --filter @ims/server dev
  ) &
  SERVER_PID="$!"
}

start_and_wait_desktop_server() {
  local attempt

  for ((attempt = 1; attempt <= SERVER_START_RETRIES + 1; attempt += 1)); do
    start_desktop_server
    if wait_server_health; then
      return 0
    fi

    log "Desktop Server 第 ${attempt} 次启动未通过健康检查: ${SERVER_HEALTH_URL}"
    if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      terminate_pid "${SERVER_PID}"
    fi
    SERVER_PID=""

    if [[ "${attempt}" -le "${SERVER_START_RETRIES}" ]]; then
      quarantine_desktop_db_files "health-failed-attempt-${attempt}"
      log "等待 1 秒后重试 Desktop Server 启动"
      sleep 1
    fi
  done

  return 1
}

main() {
  trap cleanup EXIT INT TERM

  mkdir -p "${DATA_DIR}" "${FILES_DIR}" "${AGENT_WORKSPACES_DIR}"
  cleanup_orphan_sqlite_sidecars
  choose_server_port
  SERVER_HEALTH_URL="${IMS_SERVER_HEALTH_URL:-$(health_url_for_port "${SERVER_PORT}")}"

  if [[ "${REUSE_EXISTING_SERVER}" == "1" ]]; then
    log "复用已就绪 Desktop Server: ${SERVER_HEALTH_URL}"
  else
    if ! start_and_wait_desktop_server; then
      log "Desktop Server 启动失败或健康检查超时: ${SERVER_HEALTH_URL}"
      exit 1
    fi
  fi

  if [[ "${REUSE_EXISTING_SERVER}" == "1" ]] && ! wait_server_health; then
    log "已复用的 Desktop Server 健康检查失败: ${SERVER_HEALTH_URL}"
    exit 1
  fi
  log "Desktop Server 已就绪: ${DB_PATH}"

  # 确保 UI 端口 9091 不被残留 Vite 进程占用
  release_stale_vite_on_port 9091

  log "2/2 启动 UI (pnpm --filter @ims/web dev)"
  (
    cd "${PROJECT_ROOT}"
    IMS_PORT="${SERVER_PORT}" pnpm --filter @ims/web dev
  )
}

main "$@"
