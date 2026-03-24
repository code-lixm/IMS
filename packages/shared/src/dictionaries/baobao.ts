/**
 * Baobao dictionary constants — 统一维护所有数字码表的中英文语义。
 * 所有字典均以 Record<number, Label> + type 别名形式导出，便于前后端复用。
 *
 * 使用方式（前端/后端通用）：
 *   import { APPLICATION_STATUS, type ApplicationStatus } from "@ims/shared";
 *   const label = APPLICATION_STATUS[applicant.status] ?? `未知(${applicant.status})`;
 */

// ─── 应聘状态 (applicationStatus) ───────────────────────────────────────────

/** 应聘状态码 → 中文文案 */
export const APPLICATION_STATUS_LABELS: Record<number, string> = {
  [-10]: "待HR初筛",
  [-9]:  "待HR初筛待定",
  [-8]:  "HR初筛通过",
  [-7]:  "业务筛选待定",
  [-6]:  "已离职",
  [-5]:  "放弃面试",
  [-4]:  "拒绝入职",
  [-3]:  "拒绝offer",
  [-2]:  "审批不通过",
  [-1]:  "淘汰",
  [0]:   "待面试",
  [1]:   "面试中",
  [2]:   "待定",
  [3]:   "拟录用",
  [4]:   "可录用",
  [5]:   "待入职",
  [6]:   "已录用",
} as const;

export type ApplicationStatus = keyof typeof APPLICATION_STATUS_LABELS;

export const APPLICATION_STATUS_MAX = 6;
export const APPLICATION_STATUS_MIN = -10;

/** 应聘状态码 → 语义背景色 Tailwind class（每种状态独立配色） */
export const APPLICATION_STATUS_BG_CLASS: Record<number, string> = {
  [-10]: "bg-violet-50",   // 待HR初筛 — 等待第一步审查
  [-9]:  "bg-violet-100", // 待HR初筛待定 — 有待决定
  [-8]:  "bg-cyan-50",    // HR初筛通过 — 进入下一阶段
  [-7]:  "bg-amber-50",   // 业务筛选待定 — 等待业务意见
  [-6]:  "bg-slate-200",  // 已离职 — 信息标记
  [-5]:  "bg-slate-100",  // 放弃面试 — 主动放弃
  [-4]:  "bg-orange-100", // 拒绝入职 — 接受了其他 offer
  [-3]:  "bg-rose-100",   // 拒绝offer — 拒绝了本司
  [-2]:  "bg-rose-50",    // 审批不通过 — 流程终止
  [-1]:  "bg-red-100",    // 淘汰 — 明确淘汰
  [0]:   "bg-sky-50",     // 待面试 — 即将面试
  [1]:   "bg-blue-50",    // 面试中 — 流程进行中
  [2]:   "bg-amber-50",   // 待定 — 决策悬而未决
  [3]:   "bg-teal-50",    // 拟录用 — 拟录用状态
  [4]:   "bg-emerald-50", // 可录用 — 符合录用条件
  [5]:   "bg-indigo-50",  // 待入职 — 等待入职
  [6]:   "bg-green-100",  // 已录用 — 最终成功
} as const;

/** 应聘状态码 → 语义文字色 Tailwind class */
export const APPLICATION_STATUS_TEXT_CLASS: Record<number, string> = {
  [-10]: "text-violet-700",
  [-9]:  "text-violet-800",
  [-8]:  "text-cyan-700",
  [-7]:  "text-amber-700",
  [-6]:  "text-slate-600",
  [-5]:  "text-slate-600",
  [-4]:  "text-orange-800",
  [-3]:  "text-rose-800",
  [-2]:  "text-rose-700",
  [-1]:  "text-red-800",
  [0]:   "text-sky-700",
  [1]:   "text-blue-700",
  [2]:   "text-amber-700",
  [3]:   "text-teal-700",
  [4]:   "text-emerald-700",
  [5]:   "text-indigo-700",
  [6]:   "text-green-800",
} as const;

/**
 * 获取应聘状态的完整语义 Tailwind class 列表。
 * 前端直接用 :class="applicationStatusClasses(code)"
 *
 * 用法示例：
 *   <span :class="applicationStatusClasses(statusCode)">{{ label }}</span>
 *   <Badge :class="applicationStatusClasses(statusCode)">{{ label }}</Badge>
 */
export function applicationStatusClasses(code: number): string[] {
  return [APPLICATION_STATUS_BG_CLASS[code] ?? "bg-gray-100", APPLICATION_STATUS_TEXT_CLASS[code] ?? "text-gray-700"];
}

// ─── 面试形式 (interviewType) ────────────────────────────────────────────────

/** 面试形式码 → 中文文案 */
export const INTERVIEW_TYPE_LABELS: Record<number, string> = {
  [0]: "电话面试",
  [1]: "现场面试",
  [2]: "视频面试",
} as const;

export type InterviewType = keyof typeof INTERVIEW_TYPE_LABELS;

/** 面试形式码 → 背景色 Tailwind class */
export const INTERVIEW_TYPE_BG_CLASS: Record<number, string> = {
  [0]: "bg-slate-100",   // 电话面试
  [1]: "bg-orange-50",  // 现场面试
  [2]: "bg-violet-50",  // 视频面试
} as const;

/** 面试形式码 → 文字色 Tailwind class */
export const INTERVIEW_TYPE_TEXT_CLASS: Record<number, string> = {
  [0]: "text-slate-600",
  [1]: "text-orange-700",
  [2]: "text-violet-700",
} as const;

export function interviewTypeClasses(code: number): string[] {
  return [INTERVIEW_TYPE_BG_CLASS[code] ?? "bg-gray-100", INTERVIEW_TYPE_TEXT_CLASS[code] ?? "text-gray-700"];
}

// ─── 用工类型 (employmentType) ────────────────────────────────────────────────

/** 用工类型码 → 中文文案 */
export const EMPLOYMENT_TYPE_LABELS: Record<number, string> = {
  [0]: "全职",
  [1]: "纯实习",
  [2]: "兼职",
  [3]: "劳务派遣",
  [4]: "退休返聘",
  [5]: "校招实习",
  [6]: "劳务外包",
} as const;

export type EmploymentType = keyof typeof EMPLOYMENT_TYPE_LABELS;

// ─── 性别 (gender) ────────────────────────────────────────────────────────────

/** 性别码 → 中文文案 */
export const GENDER_LABELS: Record<number, string> = {
  [0]: "男",
  [1]: "女",
} as const;

export type Gender = keyof typeof GENDER_LABELS;

// ─── 星期 (weekday) ──────────────────────────────────────────────────────────

/** 星期码 → 中文文案（0 = 周日） */
export const WEEKDAY_LABELS: Record<number, string> = {
  [0]: "周日",
  [1]: "周一",
  [2]: "周二",
  [3]: "周三",
  [4]: "周四",
  [5]: "周五",
  [6]: "周六",
} as const;

export type Weekday = keyof typeof WEEKDAY_LABELS;

// ─── 通过 / 不通过 (passStatus) ───────────────────────────────────────────────

/** 通过状态码 → 中文文案 */
export const PASS_STATUS_LABELS: Record<number, string> = {
  [-1]: "不通过",
  [1]:  "通过",
} as const;

export type PassStatus = keyof typeof PASS_STATUS_LABELS;

// ─── 婚姻状态 (maritalStatus) ────────────────────────────────────────────────

/** 婚姻状态码 → 中文文案 */
export const MARITAL_STATUS_LABELS: Record<number, string> = {
  [0]: "未婚",
  [1]: "已婚",
  [2]: "离异",
  [3]: "丧偶",
} as const;

export type MaritalStatus = keyof typeof MARITAL_STATUS_LABELS;

// ─── 出差意愿 (travelWillingness) ────────────────────────────────────────────

/** 出差意愿码 → 中文文案 */
export const TRAVEL_WILLINGNESS_LABELS: Record<number, string> = {
  [0]: "无所谓",
  [1]: "可以接受",
  [2]: "不能接受",
} as const;

export type TravelWillingness = keyof typeof TRAVEL_WILLINGNESS_LABELS;

// ─── 面试轮次 (interviewRound) ───────────────────────────────────────────────

/** 面试轮次码 → 中文文案（0 = 初试，9 = 第十轮） */
export const INTERVIEW_ROUND_LABELS: Record<number, string> = {
  [0]: "初试",
  [1]: "二面",
  [2]: "三面",
  [3]: "四面",
  [4]: "五面",
  [5]: "六面",
  [6]: "七面",
  [7]: "八面",
  [8]: "九面",
  [9]: "十面",
} as const;

export type InterviewRound = keyof typeof INTERVIEW_ROUND_LABELS;

/** 面试轮次码 → 背景色 Tailwind class（轮次越深颜色越深） */
export const INTERVIEW_ROUND_BG_CLASS: Record<number, string> = {
  [0]: "bg-sky-50",
  [1]: "bg-sky-100",
  [2]: "bg-blue-100",
  [3]: "bg-blue-200",
  [4]: "bg-indigo-200",
  [5]: "bg-indigo-300",
  [6]: "bg-purple-200",
  [7]: "bg-purple-300",
  [8]: "bg-violet-300",
  [9]: "bg-violet-400",
} as const;

/** 面试轮次码 → 文字色 Tailwind class */
export const INTERVIEW_ROUND_TEXT_CLASS: Record<number, string> = {
  [0]: "text-sky-700",
  [1]: "text-sky-800",
  [2]: "text-blue-800",
  [3]: "text-blue-900",
  [4]: "text-indigo-900",
  [5]: "text-indigo-900",
  [6]: "text-purple-900",
  [7]: "text-purple-900",
  [8]: "text-violet-900",
  [9]: "text-violet-950",
} as const;

export function interviewRoundClasses(code: number): string[] {
  return [INTERVIEW_ROUND_BG_CLASS[code] ?? "bg-gray-100", INTERVIEW_ROUND_TEXT_CLASS[code] ?? "text-gray-700"];
}

// ─── 逆向查找：文本 → 数字码 ────────────────────────────────────────────────

/** 中文文案 → 应聘状态数字码（用于从 statusRaw 文本反查 numeric code） */
export const APPLICATION_STATUS_CODE_FROM_TEXT: Record<string, number> = {
  "待HR初筛": -10,
  "待HR初筛待定": -9,
  "HR初筛通过": -8,
  "业务筛选待定": -7,
  "已离职": -6,
  "放弃面试": -5,
  "拒绝入职": -4,
  "拒绝offer": -3,
  "审批不通过": -2,
  "淘汰": -1,
  "待面试": 0,
  "面试中": 1,
  "待定": 2,
  "拟录用": 3,
  "可录用": 4,
  "待入职": 5,
  "已录用": 6,
  // 兼容面试进度状态（派生）
  "已面试": 1,   // → 面试中
  "已取消": -5,  // → 放弃面试（语义最接近）
} as const;

/**
 * 从 statusRaw 文本或 numeric code 获取 applicationStatus 数字码。
 * 优先返回数字码；如果是文本，尝试从字典反查。
 */
export function resolveApplicationStatusCode(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return asNumber;
    return APPLICATION_STATUS_CODE_FROM_TEXT[trimmed] ?? null;
  }
  return null;
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/** 通用 lookup 工具函数 — 找不到时返回 `undefined`（调用方自行决定兜底文案） */
export function lookupLabel<T extends number>(
  table: Record<number, string>,
  code: T,
): string | undefined {
  return table[code];
}

/** 带兜底的 lookup — 找不到时返回 `未知(${code})` */
export function lookupLabelOrDefault<T extends number>(
  table: Record<number, string>,
  code: T,
): string {
  return table[code] ?? `未知(${code})`;
}
