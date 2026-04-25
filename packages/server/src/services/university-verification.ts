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


interface ApiDaxueResponse {
  code: number;
  msg?: string;
  data?: {
    intro?: string;
    [key: string]: unknown;
  };
}

function extractEliteLabels(intro: string): {
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
} {
  const is985 = /985/.test(intro);
  const is211 = /211/.test(intro);
  const isDoubleFirstClass = /双一流/.test(intro);
  return { is985, is211, isDoubleFirstClass };
}

function extractSchoolName(education: string): string {
  return education.split(/\s+/)[0] || "";
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
    verdict: row.found === 1 ? "verified" : "not_found",
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
): Promise<UniversityVerificationResult> {
  const cached = db
    .select()
    .from(universityCache)
    .where(eq(universityCache.schoolName, schoolName))
    .get();

  if (cached) {
    return rowToResult(schoolName, cached);
  }

  let rawJson: string;
  try {
    const response = await fetch(
      `${API_BASE}?daxue=${encodeURIComponent(schoolName)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    rawJson = (await response.text()) || "";
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "网络请求失败";
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
        detail: "Invalid JSON response",
        found: 0,
        queriedAt: now,
      })
      .run();

    return {
      schoolName,
      found: false,
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      detail: "Invalid JSON response",
      verdict: "api_failed",
    };
  }

  if (parsed.code !== 200) {
    const detail = parsed.msg ?? `API returned code ${parsed.code}`;
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

  const data = parsed.data;
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
): Promise<UniversityVerificationResult[]> {
  if (!candidateEducation || candidateEducation.length === 0) {
    return [];
  }

  const schools = candidateEducation.map(extractSchoolName).filter(Boolean);

  if (schools.length === 0) {
    return [];
  }

  const uniqueSchools = [...new Set(schools)];
  const results = await Promise.all(uniqueSchools.map(verifySchool));

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
