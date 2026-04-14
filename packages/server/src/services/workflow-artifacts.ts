import type { WorkflowStage } from "./lui-workflow-runtime";

export interface WorkflowArtifactMetadataInput {
  stage: WorkflowStage;
  candidateName: string;
  position: string | null;
  round?: number | null;
  sourceInputs?: string[];
  generatedBy?: string;
  generatedAt?: string;
}

function toYamlList(items: string[]) {
  return items.map((item) => `  - ${JSON.stringify(item)}`).join("\n");
}

export function resolveStageFileName(stage: WorkflowStage, round?: number | null): string {
  switch (stage) {
    case "S0":
      return "00_筛选报告.md";
    case "S1":
      return typeof round === "number" && round >= 1 && round <= 4
        ? `01_面试题_第${round}轮.md`
        : "01_面试题.md";
    case "S2":
      return "02_面试评分报告.md";
    default:
      return "workflow-output.md";
  }
}

export function buildStageFrontmatter(input: WorkflowArtifactMetadataInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceInputs = input.sourceInputs && input.sourceInputs.length > 0
    ? input.sourceInputs
    : [
        input.stage === "S0"
          ? "./resume.pdf"
          : input.stage === "S1"
            ? "./00_筛选报告.md"
            : `./01_面试题_第${input.round ?? 1}轮.md`,
      ];

  return [
    "---",
    "type: interview-stage-document",
    `stage: ${input.stage}`,
    `candidate_name: ${JSON.stringify(input.candidateName)}`,
    `position: ${JSON.stringify(input.position ?? "未提供")}`,
    input.stage !== "S0" && typeof input.round === "number" ? `round: ${input.round}` : null,
    "source_inputs:",
    toYamlList(sourceInputs),
    `generated_by: ${input.generatedBy ?? "interview-orchestrator"}`,
    `generated_at: ${JSON.stringify(generatedAt)}`,
    'schema_version: "1.1.0"',
    "---",
  ].filter(Boolean).join("\n");
}

export function withStageFrontmatter(markdown: string, metadata: WorkflowArtifactMetadataInput): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("---\n")) {
    return trimmed;
  }
  return `${buildStageFrontmatter(metadata)}\n\n${trimmed}`;
}
