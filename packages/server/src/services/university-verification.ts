/**
 * University Verification Service
 *
 * Queries https://api.52vmy.cn/api/query/daxue for university metadata,
 * extracts 985/211/双一流 labels from the response, and caches results
 * in the local SQLite university_cache table.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { universityCache } from "../schema";
import type { UniversityVerificationResult } from "@ims/shared";

const API_BASE = "https://api.52vmy.cn/api/query/daxue";
const TIMEOUT_MS = 5_000;
const API_FAILED_CACHE_TTL_MS = 5 * 60 * 1000;
const API_UNAVAILABLE_DETAIL = "外部院校验证服务暂不可用，本次未完成查询，可稍后重试";


interface ApiDaxueResponse {
  code: number;
  msg?: string;
  data?: string | {
    intro?: string;
    [key: string]: unknown;
  } | null;
}

export function sanitizeSchoolQueryName(schoolName: string): string {
  return schoolName.replace(/[\p{P}\p{S}\s]+/gu, "").trim();
}

function isSchoolNotFoundResponse(parsed: ApiDaxueResponse): boolean {
  const messageParts = [
    parsed.msg,
    typeof parsed.data === "string" ? parsed.data : undefined,
  ];
  return parsed.code === 201 && messageParts.some((part) => part?.includes("学校不存在"));
}

function extractEliteLabels(intro: string): {
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
} {
  // 避免 1985 等年份误匹配为 985；排除 "985平台"、"小985"、"优势学科创新平台" 等非正式表述
  const is985 = /(?<!\d)985(?!\d)/.test(intro) && !/(?:小985|985\s*(?:工程)?\s*(?:优势学科创新平台|平台|特色平台)|优势学科创新平台)/.test(intro);
  // 避免 2110 等数字误匹配为 211；排除 "211平台"
  const is211 = /(?<!\d)211(?!\d)/.test(intro) && !/211平台/.test(intro);
  const isDoubleFirstClass = /双一流/.test(intro);
  return { is985, is211, isDoubleFirstClass };
}

function extractSchoolName(education: string): string {
  const parenthesizedSchool = education.match(/([\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)[（(][^）)]+[）)])/);
  if (parenthesizedSchool?.[1]?.trim()) {
    return parenthesizedSchool[1].trim();
  }

  const normalized = education
    .replace(/\([^)]*\)/g, " ")
    .replace(/[（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s+/g, "");
  const chineseMatches = Array.from(compact.matchAll(/[\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)/g));
  for (const match of chineseMatches) {
    const candidate = match[0]
      .replace(/^(?:教育背景|教育经历|毕业院校|毕业学校|学校名称|学历|院校|毕业于|就读于|我的|本人|是|于|在)+/, "")
      .trim();
    if (candidate.length >= 4) return candidate;
  }

  const englishMatch = normalized.match(/([A-Za-z][A-Za-z·.&\- ]{2,60}(?:University|College|Institute))/i);
  if (englishMatch?.[1]) {
    return englishMatch[1].trim();
  }

  return normalized
    .split(/\s+/)
    .find((part) => /大学|学院|学校|University|College|Institute/i.test(part))
    ?? "";
}

/**
 * Generate location-based aliases for school names with parenthesized locations.
 *
 * Only triggers on names ending with Chinese brackets （） or English brackets ().
 * E.g., "华北电力大学（保定）" → ["华北电力大学保定", "华北电力大学保定校区"]
 * "华北电力大学(保定)" → ["华北电力大学保定", "华北电力大学保定校区"]
 *
 * Non-parenthesized names like "东北大学秦皇岛分校" return empty array.
 */
function generateLocationAliases(schoolName: string): string[] {
  const match = schoolName.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  if (!match) return [];

  const base = match[1].trim();
  const location = match[2].trim();
  if (!base || !location) return [];

  const aliases: string[] = [];
  aliases.push(`${base}${location}`);
  aliases.push(`${base}${location}校区`);

  // Dedupe (unlikely but safe)
  return [...new Set(aliases)];
}

function rowToResult(
  schoolName: string,
  row: typeof universityCache.$inferSelect,
): UniversityVerificationResult {
  return {
    schoolName,
    found: row.found === 1,
    is985: row.is985 === 1,
    is211: row.is211 === 1,
    isDoubleFirstClass: row.isDoubleFirstClass === 1,
    detail: row.detail ?? null,
    verdict: (row.verdict as UniversityVerificationResult["verdict"]) ?? (row.found === 1 ? "verified" : "not_found"),
  };
}


/**
 * Query university metadata for a single school name.
 *
 * Flow:
 * 1. Check university_cache table for cached result
 * 2. On cache miss → call external API with 5s timeout
 * 3. Parse response, extract elite labels from data.intro
 * 4. Persist result to university_cache
 * 5. Return UniversityVerificationResult (never throws)
 */
export async function verifySchool(
  schoolName: string,
  options: { forceRefresh?: boolean } = {},
): Promise<UniversityVerificationResult> {
  const cached = db
    .select()
    .from(universityCache)
    .where(eq(universityCache.schoolName, schoolName))
    .get();

  if (cached) {
    if (options.forceRefresh && cached.verdict === "api_failed") {
      db.delete(universityCache).where(eq(universityCache.schoolName, schoolName)).run();
    } else {
    const isStaleApiFailure = cached.verdict === "api_failed" && Date.now() - cached.queriedAt > API_FAILED_CACHE_TTL_MS;
    if (isStaleApiFailure) {
      db.delete(universityCache).where(eq(universityCache.schoolName, schoolName)).run();
    } else {
      return rowToResult(schoolName, cached);
    }
    }
  }

  let rawJson: string;
  try {
    const queryName = sanitizeSchoolQueryName(schoolName) || schoolName;
    const response = await fetch(
      `${API_BASE}?daxue=${encodeURIComponent(queryName)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    rawJson = (await response.text()) || "";
  } catch (error) {
    console.warn(`[university] query unavailable for ${schoolName}: ${error instanceof Error ? error.message : String(error)}`);
    const detail = API_UNAVAILABLE_DETAIL;
    const now = Date.now();
    db.insert(universityCache)
      .values({
        id: `cache_${schoolName}`,
        schoolName,
        responseJson: "{}",
        is985: 0,
        is211: 0,
        isDoubleFirstClass: 0,
        detail,
        found: 0,
        verdict: "api_failed",
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail,
      verdict: "api_failed",
    };
  }

  let parsed: ApiDaxueResponse;
  try {
    parsed = JSON.parse(rawJson) as ApiDaxueResponse;
  } catch {
    const now = Date.now();
    db.insert(universityCache)
      .values({
        id: `cache_${schoolName}`,
        schoolName,
        responseJson: rawJson.slice(0, 10_000),
        is985: 0,
        is211: 0,
        isDoubleFirstClass: 0,
        detail: API_UNAVAILABLE_DETAIL,
        found: 0,
        verdict: "api_failed",
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail: API_UNAVAILABLE_DETAIL,
      verdict: "api_failed",
    };
  }

  if (isSchoolNotFoundResponse(parsed)) {
    const detail = typeof parsed.data === "string" ? parsed.data : parsed.msg ?? null;
    const now = Date.now();
    db.insert(universityCache)
      .values({
        id: `cache_${schoolName}`,
        schoolName,
        responseJson: rawJson.slice(0, 10_000),
        is985: 0,
        is211: 0,
        isDoubleFirstClass: 0,
        detail,
        found: 0,
        verdict: "not_found",
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail,
      verdict: "not_found",
    };
  }

  if (parsed.code !== 200) {
    const detail = API_UNAVAILABLE_DETAIL;
    const now = Date.now();
    db.insert(universityCache)
      .values({
        id: `cache_${schoolName}`,
        schoolName,
        responseJson: rawJson.slice(0, 10_000),
        is985: 0,
        is211: 0,
        isDoubleFirstClass: 0,
        detail,
        found: 0,
        verdict: "api_failed",
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail,
      verdict: "api_failed",
    };
  }

  const data = typeof parsed.data === "object" ? parsed.data : null;
  if (!data) {
    const now = Date.now();
    db.insert(universityCache)
      .values({
        id: `cache_${schoolName}`,
        schoolName,
        responseJson: rawJson.slice(0, 10_000),
        is985: 0,
        is211: 0,
        isDoubleFirstClass: 0,
        detail: "Empty data",
        found: 0,
        verdict: "not_found",
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail: null,
      verdict: "not_found",
    };
  }

  const intro = data.intro ?? "";
  const { is985, is211, isDoubleFirstClass } = extractEliteLabels(intro);
  const found = true;

  const now = Date.now();
  db.insert(universityCache)
    .values({
      id: `cache_${schoolName}`,
      schoolName,
      responseJson: rawJson.slice(0, 10_000),
      is985: is985 ? 1 : 0,
      is211: is211 ? 1 : 0,
      isDoubleFirstClass: isDoubleFirstClass ? 1 : 0,
      detail: intro || null,
      found: found ? 1 : 0,
      verdict: "verified",
      queriedAt: now,
    })
    .run();

  return {
    schoolName,
    found,
    is985,
    is211,
    isDoubleFirstClass,
    detail: intro || null,
    verdict: "verified",
  };
}

/**
 * Verify a school name with alias fallback for parenthesized location names.
 *
 * Flow:
 * 1. Try the original school name first
 * 2. If original returns "not_found" and aliases exist, try each alias
 * 3. If any alias returns "verified", use that result (with original schoolName)
 * 4. If original or any alias returns "api_failed", return immediately
 * 5. If all aliases also return "not_found", return the original result
 */
async function verifySchoolWithAliases(
  schoolName: string,
  options: { forceRefresh?: boolean } = {},
): Promise<UniversityVerificationResult> {
  const result = await verifySchool(schoolName, options);

  // If found or API failed, return immediately
  if (result.found || result.verdict === "api_failed") {
    return result;
  }

  // Generate aliases for parenthesized location names
  const aliases = generateLocationAliases(schoolName);
  if (aliases.length === 0) {
    return result;
  }

  // Try each alias
  for (const alias of aliases) {
    const aliasResult = await verifySchool(alias, options);
    if (aliasResult.verdict === "api_failed") {
      // API unavailable during alias attempt, return api_failed
      return { ...aliasResult, schoolName };
    }
    if (aliasResult.found) {
      return { ...aliasResult, schoolName };
    }
  }

  // All aliases also not found, return original result
  return result;
}

/**
 * Verify all schools mentioned in a candidate's education list.
 *
 * @param candidateEducation - Array of education strings (from ParsedResume.education)
 * @returns Verification results ordered by highest degree priority
 *
 * Degree priority heuristic: 博士 > 硕士 > 本科 > 专科 > 高中
 * Within the same degree level, preserve original order.
 */
export async function verifyCandidateSchools(
  candidateEducation: string[],
  schoolNames?: string[],
  options: { forceRefresh?: boolean } = {},
): Promise<UniversityVerificationResult[]> {
  if (!candidateEducation || candidateEducation.length === 0) {
    return [];
  }

  const schools = schoolNames ?? candidateEducation.map(extractSchoolName).filter(Boolean);

  if (schools.length === 0) {
    return [];
  }

  const uniqueSchools = [...new Set(schools)];
  const results = await Promise.all(uniqueSchools.map((schoolName) => verifySchoolWithAliases(schoolName, options)));

  const resultMap = new Map<string, UniversityVerificationResult>();
  for (const r of results) {
    if (r.schoolName) resultMap.set(r.schoolName, r);
  }

  const ordered = schools
    .map((s) => resultMap.get(s))
    .filter((r): r is UniversityVerificationResult => r !== undefined);

  const degreePriority: Record<string, number> = {
    "博士": 6,
    "硕士": 5,
    "本科": 4,
    "专科": 3,
    "大专": 3,
    "中专": 2,
    "高中": 1,
  };

  const degreeResults = ordered.map((r, i) => {
    const edu = candidateEducation[i] ?? "";
    let priority = 0;
    for (const [keyword, p] of Object.entries(degreePriority)) {
      if (edu.includes(keyword)) {
        priority = Math.max(priority, p);
      }
    }
    return { result: r, priority };
  });

  degreeResults.sort((a, b) => b.priority - a.priority);

  return degreeResults.map((d) => d.result);
}
