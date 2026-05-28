import type { ImportTaskResultData } from "@ims/shared/src/api-types";

export interface ScreeningCandidateOverview {
  name: string;
  position: string;
  educationSchool: string;
  yearsLabel: string;
}

export interface ScreeningCandidateOverviewItem {
  label: string;
  value: string;
}

export function buildScreeningCandidateOverview(
  result: ImportTaskResultData | null | undefined,
): ScreeningCandidateOverview {
  const conclusion = result?.screeningConclusion;
  const parsedResume = result?.parsedResume;

  const name = firstText(conclusion?.candidateName, parsedResume?.name) ?? "未识别";
  const position = firstText(conclusion?.candidatePosition, parsedResume?.position) ?? "未填写";
  const education = firstEducationText(
    conclusion?.candidateEducation,
    parsedResume?.education,
  );
  const school = firstSchoolText(
    conclusion?.candidateSchools,
    conclusion?.candidateEducation,
    parsedResume?.education,
  );

  return {
    name,
    position,
    educationSchool: combineEducationAndSchool(education, school),
    yearsLabel: formatYearsLabel(
      conclusion?.candidateYearsOfExperience ?? parsedResume?.yearsOfExperience,
    ),
  };
}

export function buildScreeningCandidateOverviewItems(
  result: ImportTaskResultData | null | undefined,
): ScreeningCandidateOverviewItem[] {
  const overview = buildScreeningCandidateOverview(result);

  return [
    { label: "姓名", value: overview.name },
    { label: "目标岗位", value: overview.position },
    { label: "学历/学校", value: overview.educationSchool },
    { label: "年限/经验", value: overview.yearsLabel },
  ];
}

export function formatYearsLabel(years: number | null | undefined) {
  return years === null || years === undefined ? "经验未填写" : `${years} 年经验`;
}

function firstText(...groups: Array<Array<string | null | undefined> | string | null | undefined>) {
  for (const group of groups) {
    if (typeof group === "string") {
      const text = group.trim();
      if (text) return text;
      continue;
    }

    const text = group?.find((item) => typeof item === "string" && item.trim().length > 0)?.trim();
    if (text) return text;
  }

  return null;
}

function combineEducationAndSchool(education: string | null, school: string | null) {
  const normalizedEducation = normalizeEducationDisplay(education);
  const normalizedSchool = school?.trim() ?? null;

  if (normalizedEducation && normalizedSchool && !normalizedEducation.includes(normalizedSchool)) {
    return `${normalizedEducation} · ${normalizedSchool}`;
  }

  if (normalizedEducation && normalizedSchool) {
    return normalizedEducation;
  }

  return normalizedEducation ?? normalizedSchool ?? "未填写";
}

function firstEducationText(...groups: Array<Array<string | null | undefined> | string | null | undefined>) {
  const text = firstText(...groups);
  return normalizeEducationDisplay(text);
}

function firstSchoolText(...groups: Array<Array<string | null | undefined> | string | null | undefined>) {
  for (const group of groups) {
    const values = typeof group === "string" ? [group] : group ?? [];
    for (const value of values) {
      if (typeof value !== "string") continue;
      const school = extractSchoolNameFromEducation(value);
      if (school) return school;
    }
  }

  return null;
}

function normalizeEducationDisplay(text: string | null) {
  if (!text) return null;

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/[,，;；|｜]+/g, " · ")
    .replace(/\s*[·•]\s*/g, " · ")
    .trim();

  return normalized || null;
}

function extractSchoolNameFromEducation(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const parenthesizedSchool = normalized.match(/([\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)[（(][^）)]+[）)])/);
  if (parenthesizedSchool?.[1]) {
    return parenthesizedSchool[1].trim();
  }

  const school = normalized.match(/([\u4e00-\u9fa5A-Za-z·.&\- ]{2,50}(?:大学|学院|学校|University|College|Institute))/i);
  return school?.[1]?.trim() ?? null;
}
