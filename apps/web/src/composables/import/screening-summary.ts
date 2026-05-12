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
  const education = firstText(
    conclusion?.candidateEducation,
    parsedResume?.education,
  );
  const school = firstText(conclusion?.candidateSchools);

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
  if (education && school) {
    return `${education} · ${school}`;
  }

  return education ?? school ?? "未填写";
}
