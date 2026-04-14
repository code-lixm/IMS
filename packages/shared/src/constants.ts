/**
 * Shared constants used across server and web app.
 */

export const SERVER_HOST = "127.0.0.1";
export const SERVER_PORT = 9092;
export const SERVER_BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}` as const;

export const OPENCODE_DEFAULT_PORT = 4096;
export const OPENCODE_BASE_URL = `http://${SERVER_HOST}:${OPENCODE_DEFAULT_PORT}` as const;

export const DISCOVERY_PORT = 34567;
export const DEVICE_TTL_MS = 30_000;
export const BROADCAST_INTERVAL_MS = 10_000;

export const APP_NAME = "IMS";
export const APP_ID = "com.company.interview-manager";
export const APP_VERSION = "0.1.0";

export const IMR_FILE_EXT = ".imr";
export const IMR_MIME_TYPE = "application/x-imr";

export const INTERVIEW_ROUND_ROLE_LABELS: Record<number, string> = {
  1: "技术专家",
  2: "主管",
  3: "总监",
  4: "HR",
};

export function getInterviewRoundRoleLabel(round: number | null | undefined): string | null {
  if (typeof round !== "number" || !Number.isFinite(round)) {
    return null;
  }

  return INTERVIEW_ROUND_ROLE_LABELS[round] ?? null;
}

export function formatInterviewRoundLabel(round: number | null | undefined): string {
  if (typeof round !== "number" || !Number.isFinite(round)) {
    return "轮次待确认";
  }

  const roleLabel = getInterviewRoundRoleLabel(round);
  return roleLabel ? `${roleLabel}面试（第${round}轮）` : `第${round}轮面试`;
}
